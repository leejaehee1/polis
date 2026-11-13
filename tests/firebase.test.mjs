import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { promisify } from "node:util";
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
  await db.collection("polisTopics").doc(topic).delete();
});


test("Google signup, consent and starter draft work without reloading", {
  skip: process.env.POLIS_FIREBASE_BROWSER !== "1", timeout: 60_000,
}, async (t) => {
  assert.match(authHost ?? "", local);
  assert.match(dbHost ?? "", local);
  const server = startServer();
  t.after(() => server.close());
  await server.ready();

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: process.env.POLIS_TEST_BROWSER ?? "chrome" });
  t.after(() => browser.close());
  const context = await browser.newContext();
  context.setDefaultTimeout(12_000);
  // The emulator widget works without its optional Material Design CDN assets.
  await context.route("https://unpkg.com/**", (route) => route.abort());
  const page = await context.newPage();
  const email = randomUUID() + "@example.test";
  const nickname = "가입 확인 시민";
  await page.goto(origin + "/#account");
  let reloads = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) reloads++; });

  let failFirstAccountRead = true;
  await page.route("**/api/polis", async (route) => {
    const request = route.request();
    if (failFirstAccountRead && request.method() === "GET" && request.headers().authorization) {
      failFirstAccountRead = false;
      await route.fulfill({ status: 503, json: { error: "계정 확인 일시 오류" } });
      return;
    }
    await route.continue();
  });
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Google로 가입 또는 로그인" }).click(),
  ]);
  await popup.waitForLoadState("domcontentloaded");
  await popup.getByRole("button", { name: "Add new account" }).click();
  await popup.locator("#email-input").fill(email);
  await popup.locator("#sign-in").click();

  await page.getByRole("button", { name: "계정 상태 다시 확인" }).click();
  await page.getByLabel("공개 닉네임").fill(nickname);
  await page.getByLabel("이용 규칙에 동의합니다").check();
  await page.getByLabel("개인정보 안내에 동의합니다").check();
  await page.getByRole("button", { name: "동의하고 참여하기" }).click();
  await page.getByRole("heading", { name: nickname }).waitFor();
  await page.getByRole("status").getByText("가입을 완료했습니다. 로그인 상태입니다.").waitFor();
  assert.equal(reloads, 0);

  const app = initializeApp({ projectId }, "starter-browser-test");
  t.after(() => deleteApp(app));
  const auth = getAuth(app);
  const member = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(member.uid, { polisRole: "admin" });

  await page.getByRole("button", { name: "로그아웃" }).click();
  const [returningPopup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Google로 가입 또는 로그인" }).click(),
  ]);
  await returningPopup.waitForLoadState("domcontentloaded");
  await returningPopup.getByText(email, { exact: true }).click();
  await page.getByRole("heading", { name: nickname }).waitFor();
  await page.getByRole("status").getByText("로그인했습니다.", { exact: true }).waitFor();
  assert.equal(reloads, 0);

  await page.getByRole("link", { name: "편집실" }).click();
  await page.getByRole("button", { name: "런던 사례 초안 만들기" }).click();
  await page.getByRole("heading", { name: /런던 혼잡통행료는/ }).waitFor();
  await page.getByText("검수 대기", { exact: true }).waitFor();

  const db = getFirestore(app);
  const starter = db.collection("polisTopics").doc("starter-london-congestion");
  const draft = (await starter.get()).data();
  assert.equal(draft.draft.author, member.uid);
  assert.equal(draft.draft.sources.length, 1);
  assert.equal(draft.draft.sources[0].review, undefined);
  assert.deepEqual(draft.versions, []);
  assert.deepEqual((await send()).topics, []);
  await starter.delete();
});

test("role command previews before writing, preserves other claims and can remove a role", async (t) => {
  assert.match(authHost ?? "", local);
  const app = initializeApp({ projectId }, "role-command-test");
  t.after(() => deleteApp(app));
  const auth = getAuth(app);
  const member = await account(auth);
  const unverified = await account(auth, null, false);
  await auth.setCustomUserClaims(member.uid, { unrelatedClaim: true });

  const run = (uid, role, ...flags) => promisify(execFile)(process.execPath, [
    "scripts/polis-role.mjs", "--project", projectId, "--uid", uid, "--role", role, ...flags,
  ], { env: { ...process.env, FIREBASE_PROJECT_ID: projectId } });

  await run(member.uid, "reviewer");
  assert.deepEqual((await auth.getUser(member.uid)).customClaims, { unrelatedClaim: true });
  await assert.rejects(run(unverified.uid, "reviewer", "--apply"), /이메일을 인증한 활성 계정/);
  await run(member.uid, "reviewer", "--apply");
  assert.deepEqual((await auth.getUser(member.uid)).customClaims, { unrelatedClaim: true, polisRole: "reviewer" });
  await run(member.uid, "member", "--apply");
  assert.deepEqual((await auth.getUser(member.uid)).customClaims, { unrelatedClaim: true });
});
