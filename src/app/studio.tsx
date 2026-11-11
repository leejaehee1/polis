import { useState } from "react";
import type { FormEvent } from "react";
import { canEdit, categories } from "@/lib/policy";
import type { Command, Content, Role } from "@/lib/policy";
import type { StaffTopic } from "@/lib/store";
import { formValues, formatDate } from "./ui";
import { starterTopicId } from "@/lib/starter";
import type { Run } from "./polis";

const fields = {
  summary: "정책 요약",
  background: "정책의 배경",
  results: "관측된 성과",
  limits: "한계와 해석",
  question: "토론 질문",
} as const;

function ContentForm({ content, save, busy }: { content?: Content; save: (value: Content) => void; busy: boolean }) {
  return <form className="form" onSubmit={(event) => {
    const values = formValues(event);
    save({
      title: values.title, category: values.category as Content["category"],
      summary: values.summary, background: values.background, results: values.results,
      limits: values.limits, question: values.question,
    });
  }}>
    <label>정책 제목<input name="title" required minLength={2} maxLength={140} defaultValue={content?.title} /></label>
    <label>분야<select name="category" defaultValue={content?.category}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
    {Object.entries(fields).map(([key, label]) => <label key={key}>{label}
      <textarea name={key} defaultValue={content?.[key as keyof typeof fields]} required minLength={10} maxLength={2500} rows={3} />
    </label>)}
    <button className="primary" disabled={busy}>{content ? "초안 저장" : "초안 만들기"}</button>
  </form>;
}

function ReasonForm({ label, action, submit, busy }: { label: string; action: string; submit: (value: string, event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  return <form className="form" onSubmit={(event) => submit(formValues(event).reason, event)}>
    <label>{label}<textarea required name="reason" minLength={10} maxLength={2500} rows={2} /></label>
    <button className="secondary" disabled={busy}>{action}</button>
  </form>;
}

export function Studio({ role, topics, run, busy }: { role: Role; topics: StaffTopic[]; run: Run; busy: boolean }) {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState("");
  const topic = topics.find((item) => item.id === selected);
  return <>
    <div className="actions">
      {canEdit(role) && <button className="secondary" onClick={() => setCreating(!creating)}>{creating ? "작성 닫기" : "새 학습 주제"}</button>}
      <label className="inline-label">주제 선택
        <select value={topic?.id ?? ""} onChange={(event) => { setSelected(event.target.value); setCreating(false); }}>
          <option value="">주제를 선택하세요</option>
          {topics.map((item) => <option key={item.id} value={item.id}>{item.draft?.content.title ?? item.versions.at(-1)?.title}</option>)}
        </select>
      </label>
    </div>
    {canEdit(role) && !topics.length && !creating && <section className="section-rule narrow">
      <h2>첫 학습 주제</h2>
      <p>런던 혼잡통행료 사례의 학습 내용과 출처를 검수용 초안으로 저장할 수 있습니다.</p>
      <button className="secondary" disabled={busy} onClick={async () => {
        if (await run({ type: "createStarter" })) setSelected(starterTopicId);
      }}>런던 사례 초안 만들기</button>
    </section>}
    {creating && <div className="section-rule narrow"><h2>새 학습 주제</h2>
      <ContentForm busy={busy} save={async (content) => { if (await run({ type: "create", content })) setCreating(false); }} />
    </div>}
    {topic && !creating && <TopicStudio key={topic.id} topic={topic} role={role} run={run} busy={busy} />}
  </>;
}

function TopicStudio({ topic, role, run, busy }: { topic: StaffTopic; role: Role; run: Run; busy: boolean }) {
  const draft = topic.draft;
  const published = topic.versions.at(-1);
  const revision = draft?.id ?? "";
  const target = { topic: topic.id, revision };
  const editing = draft?.status === "draft" && topic.editable;
  const reviewing = draft?.status === "review" && topic.reviewable;
  const send = (command: Command) => { void run(command); };
  return <div className="section-rule studio">
    <h2>{draft?.content.title ?? published?.title}</h2>
    {published && <p><a href={"#topic/" + topic.id}>공개 버전 v{published.number} 보기</a></p>}
    {published && !draft && canEdit(role) && <ReasonForm busy={busy} label="공개할 정정 사유" action="정정 초안 만들기" submit={(reason) => send({ type: "revise", topic: topic.id, reason })} />}
    {draft && <>
      <p className="metadata">v{draft.number} · {{ draft: "편집 중", review: "검수 중", approved: "발행 승인" }[draft.status]}</p>
      {draft.reason && <p><strong>정정 사유</strong> {draft.reason}</p>}
      {draft.feedback && <p className="message">보완 요청 · {draft.feedback}</p>}
      {editing ? <details><summary>학습 내용 편집</summary>
        <ContentForm key={revision} content={draft.content} busy={busy} save={(content) => send({ type: "edit", ...target, content })} />
      </details> : <details><summary>검수용 학습 내용</summary><dl>
        {Object.entries(fields).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{draft.content[key as keyof typeof fields]}</dd></div>)}
      </dl></details>}
      <h3>출처 검수</h3>
      {!draft.sources.length && <p>등록한 출처가 없습니다.</p>}
      <ol className="sources">
        {draft.sources.map((source) => <li key={source.id}>
          <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>
          <p>{source.publisher} · {source.evidence}</p>
          <p className="metadata">{source.review ? "검수 완료 · " + source.review.note : "검수 대기"}</p>
          {reviewing && !source.review && <ReasonForm busy={busy} label="원문과 인용을 대조한 기록" action="출처 검수 완료" submit={(note) => send({ type: "verify", ...target, sourceId: source.id, note })} />}
          {editing && <button className="text-button" disabled={busy} onClick={() => send({ type: "removeSource", ...target, sourceId: source.id })}>출처 삭제</button>}
        </li>)}
      </ol>
      {editing && <details><summary>출처 등록</summary>
        <form className="form" onSubmit={async (event) => {
          const form = event.currentTarget;
          const { title, publisher, url, evidence } = formValues(event);
          if (await run({ type: "source", ...target, source: { title, publisher, url, evidence } })) form.reset();
        }}>
          <label>자료명<input name="title" required minLength={2} maxLength={140} /></label>
          <label>발행 기관<input name="publisher" required minLength={2} maxLength={140} /></label>
          <label>원문 주소 (HTTPS)<input type="url" name="url" required maxLength={500} /></label>
          <label>원문 위치와 인용 근거<textarea name="evidence" required minLength={10} maxLength={2500} rows={3} /></label>
          <button className="secondary" disabled={busy}>출처 등록</button>
        </form>
      </details>}
      {editing && <button className="primary" disabled={busy || !draft.sources.length} onClick={() => send({ type: "submit", ...target })}>검수 요청</button>}
      {reviewing && <>
        <ReasonForm label="보완 사유" action="보완 요청" busy={busy} submit={(reason) => send({ type: "return", ...target, reason })} />
        <button className="primary" disabled={busy || !draft.sources.length || draft.sources.some((item) => !item.review)} onClick={() => send({ type: "approve", ...target })}>발행 승인</button>
      </>}
      {draft.status === "approved" && role === "admin" && <button className="primary" disabled={busy} onClick={() => send({ type: "publish", ...target })}>공개 발행</button>}
    </>}
    {topic.reports.length > 0 && <section className="section-rule">
      <h3>토론 신고</h3>
      {topic.reports.map((report) => <div key={report.id} className="comment">
        <p>{report.comment}</p><p><strong>신고 사유</strong> {report.reason}</p>
        {report.resolution ? <p>처리 완료 · {report.resolution.reason}</p> : <form className="form" onSubmit={(event) => {
          const values = formValues(event);
          send({ type: "resolve", topic: topic.id, reportId: report.id, hide: values.action === "hide", reason: values.reason });
        }}>
          <label>처리 방법<select name="action"><option value="dismiss">공개 유지</option><option value="hide">의견 숨김</option></select></label>
          <label>처리 근거<textarea name="reason" required minLength={10} maxLength={2500} rows={2} /></label>
          <button className="secondary" disabled={busy}>신고 처리</button>
        </form>}
      </div>)}
    </section>}
    <details className="section-rule"><summary>감사 이력 ({topic.audit.length})</summary>
      <ol className="sources">{[...topic.audit].reverse().map((entry, index) => <li key={index}>
        <strong>{entry.action}</strong> · {formatDate(entry.at)} · {entry.by}{entry.detail && <p>{entry.detail}</p>}
      </li>)}</ol>
    </details>
  </div>;
}
