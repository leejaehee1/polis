import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCommand, commandSchema, consentVersion, PolicyError, publicTopic } from "../src/lib/policy";
import type { Actor, Topic, TopicCommand } from "../src/lib/policy";
import { seedTopic } from "../src/lib/seed";

const editor: Actor = { id: "editor", role: "editor" };
const reviewer: Actor = { id: "reviewer", role: "reviewer" };
const admin: Actor = { id: "admin", role: "admin" };
const citizen: Actor = { id: "citizen", role: "member" };
const at = "2026-11-12T03:00:00.000Z";
const profile = { name: "시민 연구자", version: consentVersion, acceptedAt: at };
const source = seedTopic.versions[0].sources[0];
const content = seedTopic.versions[0].content;
const reason = "검수 사유를 기록해 두었습니다.";

function workflow(initial?: Topic) {
  let topic = initial;
  let seq = 0;
  return {
    get topic() { return topic!; },
    apply(command: TopicCommand, actor: Actor) {
      topic = applyCommand(topic, command, actor, profile, "test-" + ++seq, at);
      return topic;
    },
    target() { return { topic: topic!.id, revision: topic!.draft!.id }; },
  };
}

function hasStatus(status: number) {
  return (error: unknown) => error instanceof PolicyError && error.status === status;
}

test("publication needs consent, editor role, source review, independent approval and publisher role", () => {
  const flow = workflow();
  const create = { type: "create", content } as const;
  assert.throws(() => applyCommand(undefined, create, editor, undefined, "no-consent", at), hasStatus(403));
  assert.throws(() => flow.apply(create, citizen), hasStatus(403));
  flow.apply(create, editor);
  assert.equal(publicTopic(flow.topic), null);
  assert.throws(() => flow.apply({ type: "submit", ...flow.target() }, editor), hasStatus(409));
  const stale = flow.target();
  flow.apply({ type: "source", ...flow.target(), source }, editor);
  assert.throws(() => flow.apply({ type: "edit", ...stale, content }, editor), hasStatus(409));
  flow.apply({ type: "submit", ...flow.target() }, editor);
  assert.throws(() => flow.apply({ type: "publish", ...flow.target() }, admin), hasStatus(409));
  assert.throws(() => flow.apply({ type: "approve", ...flow.target() }, reviewer), hasStatus(409));
  assert.throws(() => flow.apply({ type: "approve", ...flow.target() }, { ...admin, id: editor.id }), hasStatus(403));
  flow.apply({ type: "return", ...flow.target(), reason }, reviewer);
  assert.equal(flow.topic.draft?.feedback, reason);
  flow.apply({ type: "submit", ...flow.target() }, editor);
  flow.apply({ type: "verify", ...flow.target(), sourceId: flow.topic.draft!.sources[0].id, note: reason }, reviewer);
  flow.apply({ type: "approve", ...flow.target() }, reviewer);
  assert.throws(() => flow.apply({ type: "publish", ...flow.target() }, reviewer), hasStatus(403));
  flow.apply({ type: "publish", ...flow.target() }, admin);
  const publication = publicTopic(flow.topic)!;
  assert.equal(publication.versions[0].content.title, content.title);
  assert.equal("review" in publication.versions[0].sources[0], false);
  assert.equal("audit" in publication, false);
});

test("correction preserves public v1, rechecks sources and keeps versioned discussion", () => {
  const flow = workflow(seedTopic);
  const topic = seedTopic.id;
  flow.apply({ type: "comment", topic, version: 1, body: reason }, citizen);
  assert.throws(() => flow.apply({ type: "comment", topic, version: 1, body: reason }, citizen), hasStatus(429));
  flow.apply({ type: "revise", topic, reason }, editor);
  assert.equal(publicTopic(flow.topic)!.versions.length, 1);
  flow.apply({ type: "submit", ...flow.target() }, editor);
  assert.throws(() => flow.apply({ type: "approve", ...flow.target() }, reviewer), hasStatus(409));
  flow.apply({ type: "verify", ...flow.target(), sourceId: source.id, note: reason }, reviewer);
  flow.apply({ type: "approve", ...flow.target() }, reviewer);
  flow.apply({ type: "publish", ...flow.target() }, admin);
  assert.deepEqual(publicTopic(flow.topic)!.versions.map((item) => item.number), [1, 2]);
  assert.equal(publicTopic(flow.topic)!.versions[1].reason, reason);
  assert.equal(publicTopic(flow.topic)!.comments[0].version, 1);
  assert.throws(() => flow.apply({ type: "comment", topic, version: 1, body: reason }, editor), hasStatus(409));
});

test("only staff can moderate reports and hidden opinions are removed from public view", () => {
  const flow = workflow(seedTopic);
  const topic = seedTopic.id;
  flow.apply({ type: "comment", topic, version: 1, body: reason }, citizen);
  const commentId = flow.topic.comments[0].id;
  assert.throws(() => flow.apply({ type: "report", topic, commentId, reason }, citizen), hasStatus(400));
  flow.apply({ type: "report", topic, commentId, reason }, editor);
  assert.throws(() => flow.apply({ type: "report", topic, commentId, reason }, editor), hasStatus(409));
  const resolve = { type: "resolve", topic, reportId: flow.topic.reports[0].id, hide: true, reason } as const;
  assert.throws(() => flow.apply(resolve, editor), hasStatus(403));
  flow.apply(resolve, reviewer);
  assert.equal(publicTopic(flow.topic)!.comments.length, 0);
  assert.equal(flow.topic.audit.at(-1)?.action, "신고 의견 숨김");
});

test("rejects non-HTTPS links, missing consent and invalid identifiers", () => {
  assert.equal(commandSchema.safeParse({ type: "source", topic: "topic", revision: "draft", source: { ...source, url: "javascript:alert(1)" } }).success, false);
  assert.equal(commandSchema.safeParse({ type: "consent", name: "시민", terms: true, privacy: false, version: consentVersion }).success, false);
  assert.equal(commandSchema.safeParse({ type: "comment", topic: "../draft", version: 1, body: reason }).success, false);
});

test("starter draft is private, pending source review, and idempotent", () => {
  const flow = workflow();
  const command = { type: "createStarter" } as const;
  assert.throws(() => flow.apply(command, citizen), hasStatus(403));
  const draft = flow.apply(command, editor);
  assert.equal(draft.draft?.author, editor.id);
  assert.equal(draft.draft?.sources[0].review, undefined);
  assert.equal(publicTopic(draft), null);
  assert.equal(flow.apply(command, admin), draft);
});
