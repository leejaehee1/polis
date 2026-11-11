import { z } from "zod";

const short = z.string().trim().min(2).max(140);
const paragraph = z.string().trim().min(10).max(2500);
const id = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
const httpsUrl = z.string().max(500).url().refine((value) => {
  const url = URL.canParse(value) ? new URL(value) : null;
  return url?.protocol === "https:" && !url.username && !url.password;
});
export const categories = ["교통", "주거", "복지", "환경", "교육", "기타"] as const;
export const contentSchema = z.object({
  title: short, category: z.enum(categories), summary: paragraph,
  background: paragraph, results: paragraph, limits: paragraph, question: paragraph,
});
export const sourceSchema = z.object({
  title: short, publisher: short, url: httpsUrl, evidence: paragraph,
});
export const consentVersion = "2026-11-v1";
export const consentText = {
  terms: "공개 의견은 정책과 근거를 중심으로 작성합니다. 타인의 개인정보, 위협, 인신공격을 게시하지 않습니다. 운영자는 신고 검토 후 의견을 숨길 수 있습니다.",
  privacy: "서비스는 계정 식별자, 공개 닉네임, 동의 버전과 시각을 저장합니다. 게시 의견은 닉네임과 함께 공개되고, 신고 사유는 검수 담당자에게만 공개됩니다.",
};

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("consent"), name: z.string().trim().min(2).max(24), terms: z.literal(true), privacy: z.literal(true), version: z.literal(consentVersion) }),
  z.object({ type: z.literal("create"), content: contentSchema }),
  z.object({ type: z.literal("revise"), topic: id, reason: paragraph }),
  z.object({ type: z.literal("edit"), topic: id, revision: id, content: contentSchema }),
  z.object({ type: z.literal("source"), topic: id, revision: id, source: sourceSchema }),
  z.object({ type: z.literal("removeSource"), topic: id, revision: id, sourceId: id }),
  z.object({ type: z.literal("submit"), topic: id, revision: id }),
  z.object({ type: z.literal("verify"), topic: id, revision: id, sourceId: id, note: paragraph }),
  z.object({ type: z.literal("return"), topic: id, revision: id, reason: paragraph }),
  z.object({ type: z.literal("approve"), topic: id, revision: id }),
  z.object({ type: z.literal("publish"), topic: id, revision: id }),
  z.object({ type: z.literal("comment"), topic: id, version: z.number().int().positive(), body: paragraph }),
  z.object({ type: z.literal("report"), topic: id, commentId: id, reason: paragraph }),
  z.object({ type: z.literal("resolve"), topic: id, reportId: id, hide: z.boolean(), reason: paragraph }),
]);
export type Command = z.infer<typeof commandSchema>;
export type TopicCommand = Exclude<Command, { type: "consent" }>;
export type Content = z.infer<typeof contentSchema>;
export type Source = z.infer<typeof sourceSchema> & { id: string; review?: { by: string; at: string; note: string } };
export const roles = ["member", "editor", "reviewer", "admin"] as const;
export type Role = typeof roles[number];
export type Actor = { id: string; role: Role };
export type Profile = { name: string; version: string; acceptedAt: string };
export type Revision = {
  id: string; number: number; content: Content; sources: Source[];
  reason: string; publishedAt: string;
};
export type Draft = Omit<Revision, "publishedAt"> & {
  author: string; status: "draft" | "review" | "approved"; feedback: string;
};
export type Comment = {
  id: string; by: string; name: string; body: string; version: number; at: string; hidden: boolean;
};
export type Report = {
  id: string; commentId: string; by: string; reason: string; at: string;
  resolution?: { hide: boolean; reason: string };
};
export type Topic = {
  id: string; draft: Draft | null; versions: Revision[]; comments: Comment[];
  reports: Report[]; audit: { action: string; by: string; at: string; detail?: string }[];
};
export const canEdit = (role: Role) => role === "editor" || role === "admin";
export const canReview = (role: Role) => role === "reviewer" || role === "admin";

export class PolicyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function requireState(condition: unknown, message: string, status = 409): asserts condition {
  if (!condition) throw new PolicyError(status, message);
}

export function publicTopic(topic: Topic) {
  if (!topic.versions.length) return null;
  return {
    id: topic.id,
    versions: topic.versions.map((version) => ({
      ...version,
      sources: version.sources.map(({ id, title, publisher, url, evidence }) => ({ id, title, publisher, url, evidence })),
    })),
    comments: topic.comments.filter((comment) => !comment.hidden).map(({ id, name, body, version, at }) => ({ id, name, body, version, at })),
  };
}
export type PublicTopic = NonNullable<ReturnType<typeof publicTopic>>;

export function applyCommand(
  existing: Topic | undefined, command: TopicCommand, actor: Actor, profile: Profile | undefined,
  newId: string, at: string,
): Topic {
  requireState(profile?.version === consentVersion, "이용 규칙과 개인정보 안내에 먼저 동의해 주세요.", 403);
  if (command.type === "create") {
    requireState(canEdit(actor.role), "편집 권한이 필요합니다.", 403);
    return {
      id: newId, versions: [], comments: [], reports: [],
      draft: { id: newId, number: 1, content: command.content, sources: [], reason: "", author: actor.id, status: "draft", feedback: "" },
      audit: [{ action: "초안 작성", by: actor.id, at }],
    };
  }
  requireState(existing, "주제를 찾을 수 없습니다.", 404);
  const topic = structuredClone(existing);
  const current = topic.versions.at(-1);
  const draft = topic.draft;
  const audit = (action: string, detail?: string) => {
    topic.audit.push({ action, by: actor.id, at, ...(detail ? { detail } : {}) });
  };

  if (command.type === "comment" || command.type === "report") {
    requireState(current, "공개된 주제에만 참여할 수 있습니다.", 404);
    if (command.type === "comment") {
      requireState(current.number === command.version, "새 버전이 발행됐습니다. 새로고침 후 내용을 확인해 주세요.");
      requireState(!topic.comments.some((item) => item.by === actor.id && Date.parse(at) - Date.parse(item.at) < 15_000), "15초 뒤 다시 작성해 주세요.", 429);
      topic.comments.push({ id: newId, by: actor.id, name: profile.name, body: command.body, version: current.number, at, hidden: false });
    } else {
      const comment = topic.comments.find((item) => item.id === command.commentId && !item.hidden);
      requireState(comment && comment.by !== actor.id, "다른 회원의 공개 의견만 신고할 수 있습니다.", 400);
      requireState(!topic.reports.some((item) => item.by === actor.id && item.commentId === command.commentId), "이미 신고한 의견입니다.");
      topic.reports.push({ id: newId, commentId: comment.id, by: actor.id, reason: command.reason, at });
    }
    return topic;
  }

  if (command.type === "resolve") {
    requireState(canReview(actor.role), "검수 권한이 필요합니다.", 403);
    const report = topic.reports.find((item) => item.id === command.reportId);
    requireState(report && !report.resolution, "처리 대기 중인 신고가 없습니다.");
    report.resolution = { hide: command.hide, reason: command.reason };
    const comment = topic.comments.find((item) => item.id === report.commentId);
    if (command.hide && comment) comment.hidden = true;
    audit(command.hide ? "신고 의견 숨김" : "신고 종결", command.reason);
    return topic;
  }

  if (command.type === "revise") {
    requireState(canEdit(actor.role), "편집 권한이 필요합니다.", 403);
    requireState(current && !draft, "공개 버전이 있고 진행 중인 초안이 없어야 합니다.");
    topic.draft = {
      id: newId, number: current.number + 1, content: current.content,
      sources: current.sources.map(({ id, title, publisher, url, evidence }) => ({ id, title, publisher, url, evidence })),
      reason: command.reason, author: actor.id, status: "draft", feedback: "",
    };
    audit("정정 초안 작성", command.reason);
    return topic;
  }

  requireState(draft?.id === command.revision, "초안이 변경되었습니다. 새로고침해 주세요.");
  if (command.type === "edit" || command.type === "source" || command.type === "removeSource" || command.type === "submit") {
    requireState(canEdit(actor.role) && (draft.author === actor.id || actor.role === "admin"), "이 초안을 편집할 권한이 없습니다.", 403);
    requireState(draft.status === "draft", "초안 상태에서만 수정할 수 있습니다.");
    if (command.type === "edit") {
      draft.content = command.content;
      draft.sources = draft.sources.map(({ id, title, publisher, url, evidence }) => ({ id, title, publisher, url, evidence }));
      audit("초안 수정");
    }
    if (command.type === "source") {
      requireState(draft.sources.length < 12, "출처는 최대 12개까지 등록할 수 있습니다.");
      draft.sources.push({ ...command.source, id: newId });
      audit("출처 등록", command.source.title);
    }
    if (command.type === "removeSource") {
      requireState(draft.sources.some((item) => item.id === command.sourceId), "출처를 찾을 수 없습니다.", 404);
      draft.sources = draft.sources.filter((item) => item.id !== command.sourceId);
      audit("출처 삭제");
    }
    if (command.type === "submit") {
      requireState(draft.sources.length > 0, "검수 요청 전에 출처를 등록해 주세요.");
      draft.status = "review";
      audit("검수 요청");
    }
    // Rotate the revision token so stale forms cannot overwrite another editor's changes.
    draft.id = newId;
    return topic;
  }

  if (command.type === "publish") {
    requireState(actor.role === "admin", "발행 권한이 필요합니다.", 403);
    requireState(draft.status === "approved", "승인된 초안만 발행할 수 있습니다.");
    topic.versions.push({
      id: newId, number: draft.number, content: draft.content, sources: draft.sources,
      reason: draft.reason, publishedAt: at,
    });
    topic.draft = null;
    audit("버전 발행", "v" + draft.number);
    return topic;
  }

  requireState(canReview(actor.role) && draft.author !== actor.id, "작성자와 다른 검수 담당자가 필요합니다.", 403);
  requireState(draft.status === "review", "검수 중인 초안에서만 처리할 수 있습니다.");
  if (command.type === "verify") {
    const source = draft.sources.find((item) => item.id === command.sourceId);
    requireState(source, "출처를 찾을 수 없습니다.", 404);
    source.review = { by: actor.id, at, note: command.note };
    audit("출처 검수", source.title);
  }
  if (command.type === "return") {
    draft.status = "draft";
    draft.feedback = command.reason;
    audit("보완 요청", command.reason);
  }
  if (command.type === "approve") {
    requireState(draft.sources.length && draft.sources.every((item) => item.review), "모든 출처의 원문과 인용 근거를 검수해 주세요.");
    draft.status = "approved";
    audit("발행 승인");
  }
  draft.id = newId;
  return topic;
}
