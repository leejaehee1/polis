"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { FirebaseOptions } from "firebase/app";
import type { Auth } from "firebase/auth";
import { categories, consentText, consentVersion, roles } from "@/lib/policy";
import type { Command, Profile, PublicTopic, Role } from "@/lib/policy";
import type { StaffTopic } from "@/lib/store";
import { formValues, formatDate } from "./ui";
import { Studio } from "./studio";

type Snapshot = {
  mode: "demo" | "firebase"; firebase: FirebaseOptions | null;
  viewer: { role: Role; profile?: Profile; consented: boolean } | null;
  topics: PublicTopic[]; staff: StaffTopic[];
};
type Destination = { page: string; id?: string; version?: number };
export type Run = (command: Command) => Promise<boolean>;
export const roleNames: Record<Role, string> = {
  member: "시민", editor: "편집자", reviewer: "검수자", admin: "발행 운영자",
};
function destination(): Destination {
  const [page, id, version] = window.location.hash.slice(1).split("/");
  return { page: page || "home", id, version: version ? Number(version) : undefined };
}

function useSnapshot() {
  const [data, setData] = useState<Snapshot>();
  const [auth, setAuth] = useState<Auth>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const request = useCallback(async (active?: Auth, body?: Command | { type: "demoRole"; role: Role | null }) => {
    const token = await active?.currentUser?.getIdToken();
    const response = await fetch("/api/polis", {
      cache: "no-store", method: body ? "POST" : "GET",
      headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }, []);

  const refresh = useCallback(async (active?: Auth) => {
    const snapshot: Snapshot = await request(active);
    setData(snapshot);
    return snapshot;
  }, [request]);

  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;
    request().then(async (snapshot: Snapshot) => {
      if (!live) return;
      setData(snapshot);
      if (snapshot.firebase) {
        const [{ getApps, initializeApp }, { getAuth, onIdTokenChanged }] = await Promise.all([
          import("firebase/app"), import("firebase/auth"),
        ]);
        if (!live) return;
        const app = getApps()[0] ?? initializeApp(snapshot.firebase);
        const active = getAuth(app);
        setAuth(active);
        unsubscribe = onIdTokenChanged(active, () => {
          request(active).then((next) => {
            if (live) { setData(next); setError(""); }
          }).catch((cause: Error) => { if (live) setError(cause.message); });
        });
      }
    }).catch((cause: Error) => { if (live) setError(cause.message); });
    return () => { live = false; unsubscribe?.(); };
  }, [request]);

  async function submit(body: Command | { type: "demoRole"; role: Role | null }) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(auth, body);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
      return false;
    }
    try {
      await refresh(auth);
      setNotice(body.type === "demoRole" ? "" : "변경 사항을 저장했습니다.");
    } catch {
      setError("변경 사항을 저장했습니다. 최신 화면을 보려면 새로고침해 주세요.");
    } finally {
      setBusy(false);
    }
    return true;
  }

  async function session(login: boolean) {
    if (!auth || busy) return;
    setBusy(true);
    setError("");
    try {
      const { signInWithPopup, GoogleAuthProvider, signOut } = await import("firebase/auth");
      if (login) await signInWithPopup(auth, new GoogleAuthProvider());
      else await signOut(auth);
    } catch {
      setError("로그인 상태를 변경하지 못했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }
  return { data, error, notice, busy, submit, session };
}

export function Polis() {
  const { data, error, notice, busy, submit, session } = useSnapshot();
  const [route, setRoute] = useState<Destination>({ page: "home" });
  useEffect(() => {
    const update = () => setRoute(destination());
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const viewer = data?.viewer;
  const staff = viewer && viewer.role !== "member";
  const selected = data?.topics.find((topic) => topic.id === route.id);
  const featured = data?.topics[0];

  let page: ReactNode;
  if (route.page === "account") {
    page = <section className="narrow page">
      <h1>내 계정</h1>
      {data?.mode === "demo" ? <>
        <p className="lead">역할을 바꿔 학습, 토론, 검수 과정을 체험할 수 있습니다. 데모 입력은 이 브라우저 세션에만 저장됩니다.</p>
        <div className="actions">{roles.map((role) => <button key={role} type="button" aria-pressed={viewer?.role === role} className={viewer?.role === role ? "primary" : "secondary"} onClick={() => void submit({ type: "demoRole", role })} disabled={busy}>{roleNames[role]}</button>)}</div>
      </> : !viewer && <button className="primary" onClick={() => void session(true)} disabled={!data || busy}>Google로 가입 또는 로그인</button>}
      {viewer && <div className="section-rule">
        <h2>{viewer.profile?.name ?? roleNames[viewer.role]}</h2>
        {viewer.consented ? <p>동의 버전 {viewer.profile?.version} · {viewer.profile && formatDate(viewer.profile.acceptedAt)}</p>
          : <Consent run={submit} busy={busy} />}
        <button className="secondary" onClick={() => void (data?.mode === "demo" ? submit({ type: "demoRole", role: null }) : session(false))} disabled={busy}>로그아웃</button>
      </div>}
    </section>;
  } else if (route.page === "studio") {
    page = <section className="page">
      <h1>편집실</h1>
      {staff && viewer.consented ? <Studio role={viewer.role} topics={data.staff} run={submit} busy={busy} />
        : <p>동의를 완료한 운영 역할로 이용할 수 있습니다. <a href="#account">계정 열기</a></p>}
    </section>;
  } else if (route.page === "topic") {
    page = selected ? <TopicDetail key={selected.id} topic={selected} version={route.version} canParticipate={!!viewer?.consented} run={submit} busy={busy} />
      : <section className="page"><h1>{data ? "정책 주제를 찾을 수 없습니다" : "정책을 불러오는 중"}</h1><a href="#learn">정책 목록 보기</a></section>;
  } else if (route.page === "rules") {
    page = <section className="narrow page">
      <h1>편집·토론 원칙</h1>
      <p>정책 목표와 관측 결과를 구분합니다. 성과, 한계, 측정 방법을 함께 기록하고 원문에서 확인할 위치를 표시합니다.</p>
      <p>편집자는 초안을 작성하고, 다른 검수 담당자는 출처와 인용을 확인합니다. 발행 후 정정하면 이전 버전과 정정 사유가 함께 공개됩니다.</p>
      <p>정당이나 후보 지지 여부로 글을 배열하지 않습니다. 공개 자료와 토론을 바탕으로 각자가 판단합니다.</p>
      <h2>이용 규칙</h2><p>{consentText.terms}</p>
      <h2>개인정보 안내</h2><p>{consentText.privacy}</p>
    </section>;
  } else {
    page = <>
      {route.page === "home" && <div className="hero">
        <div className="hero-text">
          <h1>근거로 읽고,<br />스스로 판단하는 정책</h1>
          <p>정책이 무엇을 바꿨고 어디에 한계가 있었는지 살펴보세요. 출처를 확인하고, 같은 질문을 두고 시민과 토론할 수 있습니다.</p>
          <a className="primary" href="#learn">정책 학습 시작</a>
        </div>
        {featured && <a className="hero-feature" href={"#topic/" + featured.id}>
          <div className="graphic" aria-hidden="true"><span /><span /><span /><span /><span /><i /><b /></div>
          <div className="feature-caption"><small>읽어볼 정책</small><strong>{featured.versions.at(-1)?.content.title}</strong><span aria-hidden="true">↗</span></div>
        </a>}
      </div>}
      <Archive topics={data?.topics} />
    </>;
  }

  return <>
    <a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>본문으로 건너뛰기</a>
    <header className="topbar"><div className="shell topbar-inner">
      <a className="wordmark" href="#home" aria-label="POLIS 홈"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>POLIS</a>
      <nav aria-label="주 메뉴">
        <a href="#learn" aria-current={route.page === "learn" || route.page === "topic" ? "page" : undefined}>정책 학습</a>
        <a href="#rules" aria-current={route.page === "rules" ? "page" : undefined}>원칙</a>
        {staff && <a href="#studio" aria-current={route.page === "studio" ? "page" : undefined}>편집실</a>}
        <a className="account-link" href="#account" aria-current={route.page === "account" ? "page" : undefined}>{viewer?.profile?.name ?? (data?.mode === "demo" ? "데모 체험" : "로그인")}</a>
      </nav>
    </div></header>
    <main id="main-content" tabIndex={-1} className="shell">
      {(error || notice) && <p className={error ? "message error" : "message"} role={error ? "alert" : "status"}>{error || notice}</p>}
      {page}
    </main>
    <footer className="shell footer"><strong>POLIS</strong><a href="#rules">이용 규칙 및 개인정보 안내</a>{data?.mode === "demo" && <span>로컬 데모</span>}</footer>
  </>;
}

function Archive({ topics }: { topics?: PublicTopic[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체 분야");
  const filtered = topics?.filter((topic) => {
    const content = topic.versions.at(-1)?.content;
    return content && (category === "전체 분야" || category === content.category) && (content.title + " " + content.summary).toLowerCase().includes(query.trim().toLowerCase());
  });
  return <section className="archive">
    <div className="archive-head"><h2>정책 아카이브</h2><div className="filters">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="정책 검색" placeholder="정책 검색" />
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="정책 분야">
        {["전체 분야", ...categories].map((item) => <option key={item}>{item}</option>)}
      </select>
    </div></div>
    {!topics && <p>정책을 불러오는 중입니다.</p>}
    {filtered?.length === 0 && <p>조건에 맞는 공개 정책이 없습니다.</p>}
    {filtered?.map((topic) => {
      const version = topic.versions.at(-1)!;
      return <article key={topic.id} className="archive-entry">
        <span className="category">{version.content.category}</span>
        <div><h3><a href={"#topic/" + topic.id}>{version.content.title}</a></h3><p>{version.content.summary}</p></div>
        <span className="archive-meta">v{version.number} · 의견 {topic.comments.length}</span>
      </article>;
    })}
  </section>;
}

function Consent({ run, busy }: { run: Run; busy: boolean }) {
  return <form className="form" onSubmit={(event) => {
    const values = formValues(event);
    if (values.terms && values.privacy) void run({ type: "consent", name: values.name, terms: true, privacy: true, version: consentVersion });
  }}>
    <label>공개 닉네임<input name="name" required minLength={2} maxLength={24} /></label>
    <p>{consentText.terms}</p>
    <label className="check"><input type="checkbox" name="terms" required /> 이용 규칙에 동의합니다</label>
    <p>{consentText.privacy}</p>
    <label className="check"><input type="checkbox" name="privacy" required /> 개인정보 안내에 동의합니다</label>
    <button className="primary" disabled={busy}>동의하고 참여하기</button>
  </form>;
}

function TopicDetail({ topic, version, canParticipate, run, busy }: {
  topic: PublicTopic; version?: number; canParticipate: boolean; run: Run; busy: boolean;
}) {
  const current = topic.versions.at(-1)!;
  const record = version ? topic.versions.find((item) => item.number === version) : current;
  const [reporting, setReporting] = useState<string>();
  if (!record) return <section className="page"><h1>버전을 찾을 수 없습니다</h1><a href={"#topic/" + topic.id}>최신 버전 보기</a></section>;
  const content = record.content;
  return <article className="page detail">
    <a href="#learn" className="back">‹ 정책 아카이브</a>
    <p className="metadata">{content.category} · v{record.number} · {formatDate(record.publishedAt)}</p>
    <h1>{content.title}</h1><p className="lead">{content.summary}</p>
    {record !== current && <p className="message">이전 버전을 읽고 있습니다. <a href={"#topic/" + topic.id}>최신 버전 보기</a></p>}
    <section className="section-rule"><h2>정책의 배경</h2><p>{content.background}</p></section>
    <div className="comparison"><section><h2>관측된 성과</h2><p>{content.results}</p></section><section><h2>한계와 해석</h2><p>{content.limits}</p></section></div>
    <section className="section-rule">
      <h2>근거 자료</h2>
      <ol className="sources">{record.sources.map((source) => <li key={source.id}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a><p>{source.publisher} · {source.evidence}</p>
      </li>)}</ol>
    </section>
    <details className="section-rule">
      <summary>버전 및 정정 이력 ({topic.versions.length})</summary>
      <ol className="sources">{[...topic.versions].reverse().map((item) => <li key={item.id}>
        <a href={["#topic", topic.id, item.number].join("/")}>v{item.number} · {formatDate(item.publishedAt)}</a><p>{item.reason || "최초 발행"}</p>
      </li>)}</ol>
    </details>
    <section className="section-rule discussion">
      <h2>시민 토론</h2>
      <p className="question">{content.question}</p>
      {canParticipate && record === current ? <form className="form" onSubmit={async (event) => {
        const form = event.currentTarget;
        const values = formValues(event);
        if (await run({ type: "comment", topic: topic.id, version: current.number, body: values.body })) form.reset();
      }}>
        <label>의견과 근거<textarea required name="body" minLength={10} maxLength={2500} rows={4} /></label>
        <button className="primary" disabled={busy}>의견 게시</button>
      </form> : !canParticipate && <p><a href="#account">로그인 및 동의</a> 후 의견을 남길 수 있습니다.</p>}
      {!topic.comments.length && <p>아직 공개 의견이 없습니다.</p>}
      {topic.comments.map((comment) => <div key={comment.id} className="comment">
        <strong>{comment.name}</strong> <span className="metadata">v{comment.version} · {formatDate(comment.at)}</span>
        <p>{comment.body}</p>
        {canParticipate && <button className="text-button" onClick={() => setReporting(reporting === comment.id ? undefined : comment.id)}>{reporting === comment.id ? "신고 취소" : "신고"}</button>}
        {reporting === comment.id && <form className="form" onSubmit={async (event) => {
          const values = formValues(event);
          if (await run({ type: "report", topic: topic.id, commentId: comment.id, reason: values.reason })) setReporting(undefined);
        }}>
          <label>신고 사유<textarea name="reason" required minLength={10} maxLength={2500} rows={3} /></label>
          <button className="secondary" disabled={busy}>신고 보내기</button>
        </form>}
      </div>)}
    </section>
  </article>;
}
