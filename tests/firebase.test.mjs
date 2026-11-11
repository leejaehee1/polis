import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = "demo-polis";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const dbHost = process.env.FIRESTORE_EMULATOR_HOST;
const local = /^(?:127\.0\.0\.1|localhost):[0-9]+$/;
const origin = "http://127.0.0.1:3011";
const consentVersion = "2026-11-v1";
const evidence = "원문에서 관측 기간과 비교 대상을 확인했습니다.";
const reason = "정정 전후 비교 기준을 더 명확하게 설명합니다.";
const content = {
  title: "에뮬레이터 교통 정책 통합 테스트", category: "교통",
  summary: evidence, background: evidence, results: evidence, limits: evidence, question: evidence,
};
const source = {
  title: "교통 관측 보고서", publisher: "런던교통공사", evidence,
  url: "https://content.tfl.gov.uk/central-london-congestion-charging-impacts-monitoring-sixth-annual-report.pdf",
};

function startServer(mode = "firebase-emulator") {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3011"], {
    env: {
      ...process.env, POLIS_MODE: mode, POLIS_ORIGIN: origin,
      FIREBASE_PROJECT_ID: projectId, FIREBASE_API_KEY: "emulator-only",
      FIREBASE_AUTH_DOMAIN: "localhost", FIREBASE_APP_ID: "emulator-only",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { logs += chunk; });
  const exited = once(server, "exit");
  return {
    async ready(expected = 200) {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (server.exitCode !== null) break;
        const response = await fetch(origin + "/api/polis").catch(() => null);
        if (response?.status === expected) {
          if (expected !== 200 || (await response.json()).firebase?.projectId === projectId) return;
        }
        await wait(250);
      }
      assert.fail("Firebase 테스트 서버를 시작하지 못했습니다.\n" + logs);
    },
    async close() {
      if (server.exitCode === null && server.signalCode === null) {
        server.kill();
        await exited;
      }
    },
  };
}

async function send(token, command, expected = 200) {
  const response = await fetch(origin + "/api/polis", {
    method: command ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(command ? { Origin: origin, "Content-Type": "application/json" } : {}),
    },
    ...(command ? { body: JSON.stringify(command) } : {}),
  });
  const data = await response.json();
  assert.ok([expected].flat().includes(response.status), response.status + " " + JSON.stringify(data));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return data;
}

async function signIn(email) {
  const response = await fetch("http://" + authHost + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "fixture-only-12", returnSecureToken: true }),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result.idToken;
}

async function account(auth, role, emailVerified = true) {
  const email = randomUUID() + "@example.test";
  const user = await auth.createUser({ email, emailVerified, password: "fixture-only-12" });
  if (role) await auth.setCustomUserClaims(user.uid, { polisRole: role });
  return { uid: user.uid, token: await signIn(email) };
}

test("Firebase emulators verify identity, claims, consent, publication and Firestore rules", { timeout: 90_000 }, async (t) => {
  assert.match(authHost ?? "", local, "로컬 Auth 에뮬레이터에서만 테스트합니다.");
  assert.match(dbHost ?? "", local, "로컬 Firestore 에뮬레이터에서만 테스트합니다.");
  const app = initializeApp({ projectId });
  t.after(() => deleteApp(app));
  const auth = getAuth(app);
  const db = getFirestore(app);
  let server = startServer("firebase");
  t.after(() => server.close());
  await server.ready(503);
  await server.close();

  server = startServer();
  await server.ready();

  const [member, editor, reviewer, admin, unverified] = await Promise.all([
    account(auth), account(auth, "editor"), account(auth, "reviewer"), account(auth, "admin"), account(auth, null, false),
  ]);
  await send(unverified.token, undefined, 403);
  await send("not-a-firebase-token", undefined, 401);
  await send(editor.token, { type: "create", content }, 403);

  for (const [identity, name] of [[member, "시험 시민"], [editor, "시험 편집자"], [reviewer, "시험 검수자"], [admin, "시험 운영자"]]) {
    await send(identity.token, { type: "consent", name, terms: true, privacy: true, version: consentVersion });
  }
  const receipts = await db.collection("polisProfiles").doc(member.uid).collection("consents").get();
  assert.equal(receipts.size, 1);
  assert.equal(receipts.docs[0].get("version"), consentVersion);

  await send(member.token, { type: "create", content }, 403);
  await send(editor.token, { type: "create", content });
  const topic = (await send(editor.token)).staff.find((item) => item.draft?.content.title === content.title).id;
  const studio = async (identity) => (await send(identity.token)).staff.find((item) => item.id === topic);
  const target = async (identity) => ({ topic, revision: (await studio(identity)).draft.id });
  const visible = async () => (await send()).topics.find((item) => item.id === topic);
  assert.equal(await visible(), undefined);
  assert.deepEqual((await send(member.token)).staff, []);
  const register = { type: "source", ...await target(editor), source };
  const concurrent = await Promise.all([
    send(editor.token, register, [200, 409]), send(editor.token, register, [200, 409]),
  ]);
  assert.equal(concurrent.filter((result) => result.ok).length, 1);
  assert.equal((await studio(editor)).draft.sources.length, 1);
  await send(editor.token, { type: "submit", ...await target(editor) });
  await send(admin.token, { type: "publish", ...await target(admin) }, 409);
  await send(reviewer.token, { type: "approve", ...await target(reviewer) }, 409);
  async function review() {
    const sourceId = (await studio(reviewer)).draft.sources[0].id;
    await send(reviewer.token, { type: "verify", ...await target(reviewer), sourceId, note: evidence });
    await send(reviewer.token, { type: "approve", ...await target(reviewer) });
  }
  await review();
  await send(reviewer.token, { type: "publish", ...await target(reviewer) }, 403);
  await send(admin.token, { type: "publish", ...await target(admin) });
  await send(member.token, { type: "comment", topic, version: 1, body: evidence });

  await send(editor.token, { type: "revise", topic, reason });
  assert.equal((await visible()).versions.length, 1);
  await send(editor.token, { type: "submit", ...await target(editor) });
  await review();
  await send(admin.token, { type: "publish", ...await target(admin) });
  await send(member.token, { type: "comment", topic, version: 1, body: evidence }, 409);
  const reportComment = (await visible()).comments[0].id;
  await send(editor.token, { type: "report", topic, commentId: reportComment, reason });
  assert.deepEqual((await studio(editor)).reports, []);
  const reportId = (await studio(reviewer)).reports[0].id;
  await send(reviewer.token, { type: "resolve", topic, reportId, hide: true, reason });

  const documentUrl = "http://" + dbHost + "/v1/projects/" + projectId + "/databases/(default)/documents/polisTopics/" + topic;
  for (const method of ["GET", "DELETE"]) {
    const direct = await fetch(documentUrl, { method, headers: { Authorization: "Bearer " + member.token } });
    assert.equal(direct.status, 403);
  }
  const stored = await db.collection("polisTopics").doc(topic).get();
  assert.equal(stored.get("versions").length, 2);
  assert.equal(stored.get("comments")[0].hidden, true);

  await server.close();
  server = startServer();
  await server.ready();
  const restored = await visible();
  assert.deepEqual(restored.versions.map((version) => version.number), [1, 2]);
  assert.equal(restored.versions[1].reason, reason);
  assert.equal("review" in restored.versions[1].sources[0], false);
  assert.deepEqual(restored.comments, []);

  await auth.updateUser(member.uid, { disabled: true });
  await send(member.token, undefined, 401);
});
