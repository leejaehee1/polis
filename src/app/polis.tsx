"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { FirebaseOptions } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import { categories, consentText, consentVersion, opinionKinds, roles } from "@/lib/policy";
import type { Command, OpinionKind, Profile, PublicTopic, Role } from "@/lib/policy";
import type { StaffTopic } from "@/lib/store";
import { formValues, formatDate } from "./ui";
import { CivicClassroom, ExploreHome, PolicyCompare } from "./explore";
import { Studio } from "./studio";

type Snapshot = {
  mode: "demo" | "firebase"; firebase: FirebaseOptions | null; authEmulator?: string;
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
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [retryAccount, setRetryAccount] = useState(false);
  const activeSession = useRef(false);
  const snapshotRequest = useRef(0);

  const request = useCallback(async (user?: User | null, body?: Command | { type: "demoRole"; role: Role | null }) => {
    const token = await user?.getIdToken();
    const response = await fetch("/api/polis", {
      cache: "no-store", method: body ? "POST" : "GET",
      headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }, []);

  const refresh = useCallback(async (user?: User | null) => {
    const revision = ++snapshotRequest.current;
    try {
      const snapshot: Snapshot = await request(user);
      if (revision === snapshotRequest.current) {
        setData(snapshot);
        setError("");
        setRetryAccount(false);
        return snapshot;
      }
    } catch (cause) {
      if (revision === snapshotRequest.current) throw cause;
    }
  }, [request]);

  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;
    request().then(async (snapshot: Snapshot) => {
      if (!live) return;
      setData(snapshot);
      if (snapshot.firebase) {
        const [{ getApps, initializeApp }, { connectAuthEmulator, getAuth, onIdTokenChanged }] = await Promise.all([
          import("firebase/app"), import("firebase/auth"),
        ]);
        if (!live) return;
        const app = getApps()[0] ?? initializeApp(snapshot.firebase);
        const active = getAuth(app);
        if (snapshot.authEmulator && !active.emulatorConfig) connectAuthEmulator(active, snapshot.authEmulator);
        unsubscribe = onIdTokenChanged(active, (user) => {
          if (activeSession.current) return;
          void refresh(user).catch((cause: Error) => {
            if (live) {
              setError(cause.message);
              setRetryAccount(!!user);
            }
          });
        });
        setAuth(active);
      }
    }).catch((cause: Error) => { if (live) setError(cause.message); });
    return () => { live = false; snapshotRequest.current++; unsubscribe?.(); };
  }, [refresh, request]);

  async function submit(body: Command | { type: "demoRole"; role: Role | null }) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    const user = auth?.currentUser;
    try {
      await request(user, body);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
      return false;
    }
    try {
      await refresh(user);
      if (body.type === "consent" && user) setNotice("가입을 완료했습니다. 로그인 상태입니다.");
      else setNotice(body.type === "demoRole" ? "" : "변경 사항을 저장했습니다.");
    } catch {
      setError("변경 사항을 저장했습니다. 최신 화면을 보려면 새로고침해 주세요.");
    } finally {
      setBusy(false);
    }
    return true;
  }

  async function session(login: boolean) {
    if (!auth || busy || activeSession.current) return;
    activeSession.current = true;
    ++snapshotRequest.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { signInWithPopup, GoogleAuthProvider, signOut } = await import("firebase/auth");
      if (login) {
        // The popup returns the signed-in user before the account view needs to update.
        const user = auth.currentUser ?? (await signInWithPopup(auth, new GoogleAuthProvider())).user;
        setCheckingAccount(true);
        const snapshot = await refresh(user);
        if (snapshot?.viewer?.consented) setNotice("로그인했습니다.");
      } else {
        await signOut(auth);
        setData((current) => current && { ...current, viewer: null, staff: [] });
        await refresh(null);
      }
    } catch (cause) {
      const user = auth.currentUser;
      setRetryAccount(login && !!user);
      if (login && user && cause instanceof Error) setError(cause.message);
      else if (login && (cause as { code?: string })?.code === "auth/popup-closed-by-user") setError("Google 로그인 창이 닫혔습니다. 다시 시도할 수 있습니다.");
      else setError("로그인 상태를 변경하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      activeSession.current = false;
      setCheckingAccount(false);
      setBusy(false);
    }
  }
  return { data, error, notice, busy, submit, session, authReady: !!auth, checkingAccount, retryAccount };
}

export function Polis() {
  const { data, error, notice, busy, submit, session, authReady, checkingAccount, retryAccount } = useSnapshot();
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
  const featured = data?.topics.reduce<PublicTopic | undefined>((latest, topic) =>
    !latest || Date.parse(topic.versions.at(-1)!.publishedAt) > Date.parse(latest.versions.at(-1)!.publishedAt) ? topic : latest, undefined);

  let page: ReactNode;
  if (route.page === "account") {
    page = <section className="narrow page">
      <h1>내 계정</h1>
      {data?.mode === "demo" ? <>
        <p className="lead">역할을 바꿔 학습, 토론, 검수 과정을 체험할 수 있습니다. 데모 입력은 이 브라우저 세션에만 저장됩니다.</p>
        <div className="actions">{roles.map((role) => <button key={role} type="button" aria-pressed={viewer?.role === role} className={viewer?.role === role ? "primary" : "secondary"} onClick={() => void submit({ type: "demoRole", role })} disabled={busy}>{roleNames[role]}</button>)}</div>
      </> : !viewer && <button className="primary" onClick={() => void session(true)} disabled={!authReady || busy}>{checkingAccount ? "계정 확인 중" : busy ? "Google 로그인 진행 중" : retryAccount ? "계정 상태 다시 확인" : "Google로 가입 또는 로그인"}</button>}
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
  } else if (route.page === "compare") {
    page = <PolicyCompare topics={data?.topics} />;
  } else if (route.page === "classroom") {
    page = <CivicClassroom featured={featured} />;
  } else if (route.page === "learn") {
    page = <section className="page"><h1>정책 아카이브</h1><Archive topics={data?.topics} /></section>;
  } else {
    page = <><ExploreHome featured={featured} /><Archive topics={data?.topics} home /></>;
  }

  return <>
    <a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>본문으로 건너뛰기</a>
    <header className="topbar"><div className="shell topbar-inner">
      <a className="wordmark" href="#home" aria-label="POLIS 홈"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>POLIS</a>
      <nav aria-label="주 메뉴">
        <a href="#learn" aria-current={route.page === "learn" || route.page === "topic" ? "page" : undefined}>정책 학습</a>
        <a href="#compare" aria-current={route.page === "compare" ? "page" : undefined}>비교실</a>
        <a href="#classroom" aria-current={route.page === "classroom" ? "page" : undefined}>시민 교실</a>
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

function Archive({ topics, home = false }: { topics?: PublicTopic[]; home?: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체 분야");
  const filtered = topics?.filter((topic) => {
    const content = topic.versions.at(-1)?.content;
    return content && (category === "전체 분야" || category === content.category) && (content.title + " " + content.summary).toLowerCase().includes(query.trim().toLowerCase());
  });
  return <section className="archive">
    <div className="archive-head">{home && <h2>정책 아카이브</h2>}<div className="filters">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="정책 검색" placeholder="정책 검색" />
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="정책 분야">
        {["전체 분야", ...categories].map((item) => <option key={item}>{item}</option>)}
      </select>
    </div></div>
    {!topics && <p>정책을 불러오는 중입니다.</p>}
    {filtered?.length === 0 && <p>{topics?.length ? "조건에 맞는 공개 정책이 없습니다." : "검수와 발행을 마친 정책이 여기에 표시됩니다."}</p>}
    {filtered?.map((topic) => {
      const version = topic.versions.at(-1)!;
      return <article key={topic.id} className="archive-entry">
        <span className="category">{version.content.category}</span>
        <div><ArchiveTitle home={home} href={"#topic/" + topic.id} title={version.content.title} /><p>{version.content.summary}</p></div>
        <span className="archive-meta">v{version.number} · 의견 {topic.comments.length}</span>
      </article>;
    })}
  </section>;
}

function ArchiveTitle({ home, href, title }: { home: boolean; href: string; title: string }) {
  const Heading = home ? "h3" : "h2";
  return <Heading className="archive-title"><a href={href}>{title}</a></Heading>;
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

const opinionLabels: Record<OpinionKind, string> = {
  evidence: "근거와 해석", question: "질문", alternative: "대안 제안",
};

function TopicDetail({ topic, version, canParticipate, run, busy }: {
  topic: PublicTopic; version?: number; canParticipate: boolean; run: Run; busy: boolean;
}) {
  const current = topic.versions.at(-1)!;
  const record = version ? topic.versions.find((item) => item.number === version) : current;
  const [reporting, setReporting] = useState<string>();
  const [opinionFilter, setOpinionFilter] = useState("");
  const hasTypedComments = topic.comments.some((comment) => comment.kind);
  const activeFilter = hasTypedComments ? opinionFilter : "";
  const comments = topic.comments.filter((comment) => !activeFilter || comment.kind === activeFilter);
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
        if (await run({ type: "comment", topic: topic.id, version: current.number, body: values.body, kind: opinionKinds.find((kind) => kind === values.kind) })) form.reset();
      }}>
        <label><span id="opinion-kind-label">의견 유형</span><select name="kind" aria-labelledby="opinion-kind-label" defaultValue="">
          <option value="">일반 의견</option>
          {opinionKinds.map((kind) => <option key={kind} value={kind}>{opinionLabels[kind]}</option>)}
        </select></label>
        <label>의견과 근거<textarea required name="body" minLength={10} maxLength={2500} rows={4} /></label>
        <button className="primary" disabled={busy}>의견 게시</button>
      </form> : !canParticipate && <p><a href="#account">로그인 및 동의</a> 후 의견을 남길 수 있습니다.</p>}
      {hasTypedComments && <label className="inline-label">
        <span id="opinion-filter-label">표시할 의견</span><select aria-labelledby="opinion-filter-label" value={activeFilter} onChange={(event) => setOpinionFilter(event.target.value)}>
          <option value="">모든 유형</option>
          {opinionKinds.map((kind) => <option key={kind} value={kind}>{opinionLabels[kind]}</option>)}
        </select>
      </label>}
      {!comments.length && <p>{activeFilter && topic.comments.length ? "이 유형의 공개 의견이 없습니다." : "아직 공개 의견이 없습니다."}</p>}
      {comments.map((comment) => <div key={comment.id} className="comment">
        <strong>{comment.name}</strong> {comment.kind && <span className="category">{opinionLabels[comment.kind]}</span>} <span className="metadata">v{comment.version} · {formatDate(comment.at)}</span>
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
