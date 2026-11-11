import { randomUUID } from "node:crypto";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { applyCommand, canEdit, canReview, consentVersion, PolicyError, roles } from "./policy";
import type { Actor, Command, Profile, Role, Topic } from "./policy";
import { seedTopic } from "./seed";

type Demo = { topics: Map<string, Topic>; profiles: Map<string, Profile>; role: Role | null; touched: number };
const globals = globalThis as typeof globalThis & { polisDemos?: Map<string, Demo> };
const demos = globals.polisDemos ??= new Map();
const demoLifetime = 4 * 60 * 60 * 1000;

export function getDemo(key?: string) {
  const demo = key ? demos.get(key) : undefined;
  if (!demo || Date.now() - demo.touched > demoLifetime) return undefined;
  demo.touched = Date.now();
  return demo;
}

export function createDemo() {
  const now = Date.now();
  for (const [key, demo] of demos) {
    if (now - demo.touched > demoLifetime) demos.delete(key);
  }
  if (demos.size >= 64) throw new PolicyError(503, "현재 데모 세션이 가득 찼습니다.");
  const key = randomUUID();
  const demo: Demo = {
    topics: new Map([[seedTopic.id, structuredClone(seedTopic)]]),
    profiles: new Map(), role: null, touched: now,
  };
  demos.set(key, demo);
  return { key, demo };
}

export function demoActor(demo?: Demo): Actor | undefined {
  return demo?.role ? { id: "demo-" + demo.role, role: demo.role } : undefined;
}

function adminApp() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new PolicyError(503, "Firebase 프로젝트 설정이 필요합니다.");
  return getApps()[0] ?? initializeApp({ projectId, credential: applicationDefault() });
}

export async function firebaseActor(authorization: string | null): Promise<Actor | undefined> {
  if (!authorization) return undefined;
  const token = /^Bearer ([\w.-]+)$/.exec(authorization)?.[1];
  if (!token) throw new PolicyError(401, "다시 로그인해 주세요.");
  const auth = getAuth(adminApp());
  const decoded = await auth.verifyIdToken(token, true).catch(() => {
    throw new PolicyError(401, "다시 로그인해 주세요.");
  });
  if (!decoded.email_verified) throw new PolicyError(403, "이메일 인증을 완료해 주세요.");
  const role = roles.find((item) => item === decoded.polisRole) ?? "member";
  return { id: decoded.uid, role };
}

export async function readState(actor?: Actor, demo?: Demo, isDemo = false) {
  if (isDemo) return {
    topics: demo ? Array.from(demo.topics.values()) : [seedTopic],
    profile: actor && demo ? demo.profiles.get(actor.id) : undefined,
  };
  const db = getFirestore(adminApp());
  const [topics, profile] = await Promise.all([
    db.collection("polisTopics").get(),
    actor ? db.collection("polisProfiles").doc(actor.id).get() : undefined,
  ]);
  return { topics: topics.docs.map((doc) => doc.data() as Topic), profile: profile?.data() as Profile | undefined };
}

function ensureCapacity(topic: Topic) {
  if (Buffer.byteLength(JSON.stringify(topic)) > 600_000) {
    throw new PolicyError(409, "이 주제의 저장 한도에 도달했습니다.");
  }
  return topic;
}

export async function writeState(command: Command, actor: Actor, demo?: Demo) {
  const at = new Date().toISOString();
  const newId = randomUUID();
  const profile: Profile | undefined = command.type === "consent"
    ? { name: command.name, version: consentVersion, acceptedAt: at }
    : undefined;
  if (demo) {
    if (profile) demo.profiles.set(actor.id, profile);
    if (command.type !== "consent") {
      const id = command.type === "create" ? newId : command.topic;
      if (command.type === "create" && demo.topics.size >= 20) throw new PolicyError(409, "데모에서는 주제를 20개까지 만들 수 있습니다.");
      demo.topics.set(id, ensureCapacity(applyCommand(demo.topics.get(id), command, actor, demo.profiles.get(actor.id), newId, at)));
    }
    return;
  }
  const db = getFirestore(adminApp());
  const member = db.collection("polisProfiles").doc(actor.id);
  if (command.type === "consent" && profile) {
    const receipt = member.collection("consents").doc(newId);
    const batch = db.batch();
    batch.set(member, profile);
    batch.create(receipt, profile);
    await batch.commit();
    return;
  }
  if (command.type === "consent") return;
  const id = command.type === "create" ? newId : command.topic;
  const record = db.collection("polisTopics").doc(id);
  await db.runTransaction(async (tx) => {
    const [topic, profile] = await tx.getAll(record, member);
    const next = ensureCapacity(applyCommand(topic.data() as Topic | undefined, command, actor, profile.data() as Profile | undefined, newId, at));
    tx.set(record, next);
  });
}

export function staffTopic(topic: Topic, actor: Actor) {
  return {
    id: topic.id,
    versions: topic.versions.map(({ number, content }) => ({ number, title: content.title })),
    draft: topic.draft,
    editable: canEdit(actor.role) && (topic.draft?.author === actor.id || actor.role === "admin"),
    reviewable: canReview(actor.role) && topic.draft?.author !== actor.id,
    audit: topic.audit,
    reports: canReview(actor.role) ? topic.reports.map((report) => ({
      id: report.id, reason: report.reason, at: report.at, resolution: report.resolution,
      comment: topic.comments.find((comment) => comment.id === report.commentId)?.body,
    })) : [],
  };
}
export type StaffTopic = ReturnType<typeof staffTopic>;
