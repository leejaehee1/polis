import { useState } from "react";
import type { PublicTopic } from "@/lib/policy";
import { formatDate } from "./ui";

export function ExploreHome({ featured }: { featured?: PublicTopic }) {
  const edition = featured?.versions.at(-1);
  return <>
    <section className="explore-hero" aria-labelledby="home-title">
      <div className="hero-intro">
        <h1 id="home-title">정책을 읽고,<br />내 기준을 세우다</h1>
        <p>정책이 바꾸려 한 것, 실제로 달라진 것, 아직 알 수 없는 것을 살펴보세요.</p>
        <a className="primary" href="#learn">공개 정책 탐색</a>
      </div>
      {edition && featured ? <article className="feature-evidence">
        <p className="feature-label">읽어볼 정책 · {edition.content.category}</p>
        <h2><a href={`#topic/${featured.id}`}>{edition.content.title}</a></h2>
        <p>{edition.content.summary}</p>
        <dl>
          <div><dt>근거 자료</dt><dd>{edition.sources.length}건</dd></div>
          <div><dt>최근 발행</dt><dd>{formatDate(edition.publishedAt)}</dd></div>
        </dl>
      </article> : <aside className="feature-evidence">
        <h2>정책은 어떻게 읽을까요?</h2>
        <p>시민 교실에서 성과를 판단하는 기준과 원문을 확인하는 방법을 연습할 수 있습니다.</p>
        <a href="#classroom">정책 읽기 연습</a>
      </aside>}
    </section>
    <nav className="explore-paths" aria-label="정책 학습 도구">
      <a href="#compare"><strong>정책 비교실</strong><span>두 발행본을 같은 항목으로 읽기</span></a>
      <a href="#classroom"><strong>시민 교실</strong><span>수치와 출처를 읽는 법 연습하기</span></a>
      <a href="#rules"><strong>편집·토론 원칙</strong><span>검수와 발행, 정정 절차 살펴보기</span></a>
    </nav>
  </>;
}

function editionsFor(topics: PublicTopic[]) {
  return topics.flatMap((topic) => [...topic.versions].reverse().map((version) => ({
    key: `${topic.id}/${version.number}`,
    href: `#topic/${topic.id}/${version.number}`,
    version,
  })));
}

const comparisonFields = [
  ["background", "정책의 배경"],
  ["results", "관측된 성과"],
  ["limits", "한계와 해석"],
] as const;

export function PolicyCompare({ topics }: { topics?: PublicTopic[] }) {
  const [leftKey, setLeftKey] = useState("");
  const [rightKey, setRightKey] = useState("");
  const editions = editionsFor(topics ?? []);
  const left = editions.find((edition) => edition.key === leftKey) ?? editions[0];
  const right = editions.find((edition) => edition.key === rightKey && edition.key !== left?.key)
    ?? editions.find((edition) => edition.key !== left?.key);
  return <section className="page">
    <h1>정책 비교실</h1>
    <p className="lead">두 공개 발행본의 배경, 성과, 한계를 나란히 읽으세요. 비교할 때는 지역과 기간, 측정 지표가 같은지 확인해 보세요.</p>
    {!topics ? <p role="status">공개 정책을 불러오는 중입니다.</p> : !left || !right ? <div className="study-note">
      <h2>비교할 발행본이 더 필요합니다</h2>
      <p>정책이나 정정 버전이 하나 더 공개되면 여기서 비교할 수 있습니다.</p>
      <a href={left?.href ?? "#learn"}>{left ? "현재 공개 발행본 읽기" : "정책 아카이브 보기"}</a>
    </div> : <>
      <div className="compare-controls">
        <label><span id="compare-first-label">첫 번째 발행본</span>
          <select aria-labelledby="compare-first-label" value={left.key} onChange={(event) => setLeftKey(event.target.value)}>
            {editions.map(({ key, version }) => <option key={key} value={key}>{version.content.title} · v{version.number}</option>)}
          </select>
        </label>
        <label><span id="compare-second-label">두 번째 발행본</span>
          <select aria-labelledby="compare-second-label" value={right.key} onChange={(event) => setRightKey(event.target.value)}>
            {editions.filter(({ key }) => key !== left.key).map(({ key, version }) =>
              <option key={key} value={key}>{version.content.title} · v{version.number}</option>)}
          </select>
        </label>
      </div>
      <div className="compare-grid">
        {comparisonFields.map(([field, label]) => <section key={field} className="compare-row">
          <h2>{label}</h2>
          {[left, right].map(({ key, version }) => <div key={key}>
            <h3>{version.content.title} · v{version.number}</h3>
            <p>{version.content[field]}</p>
          </div>)}
        </section>)}
        <section className="compare-row">
          <h2>근거 자료</h2>
          {[left, right].map(({ key, href, version }) => <div key={key}>
            <h3>{version.content.title} · v{version.number}</h3>
            <ul className="compare-sources">{version.sources.map((source) => <li key={source.id}>
              <a href={source.url}>{source.title}</a><p>{source.publisher} · {source.evidence}</p>
            </li>)}</ul>
            <a href={href}>이 발행본에서 근거와 토론 보기</a>
          </div>)}
        </section>
      </div>
    </>}
  </section>;
}

const answerOptions = [
  { label: "도입 전후에 같은 방법으로 측정했는지 확인한다.", feedback: "맞습니다. 측정 방법이 같아야 두 수치의 차이를 해석할 수 있습니다. 도로 공사나 교통수단 변화도 함께 확인하면 정책의 영향을 판단하는 데 도움이 됩니다." },
  { label: "도입 이후 수치가 줄었으므로 변화 전체를 정책 효과로 본다.", feedback: "측정 기간과 방법을 먼저 비교해 보세요. 같은 기간에 일어난 다른 변화도 수치에 영향을 줄 수 있습니다." },
] as const;

export function CivicClassroom({ featured }: { featured?: PublicTopic }) {
  const [answer, setAnswer] = useState<number | null>(null);
  return <section className="page narrow classroom">
    <h1>시민 교실</h1>
    <p className="lead">정책의 효과를 판단하기 전에 확인할 세 가지입니다.</p>
    <ol className="reading-steps">
      <li><h2>무엇을 바꾸려 했나요?</h2><p>정책 목표를 찾고, 그 목표가 어떤 지표로 측정되는지 확인하세요.</p></li>
      <li><h2>무엇과 비교했나요?</h2><p>전후 수치를 읽을 때는 비교 기준과 관측 기간, 같은 시기에 일어난 변화를 살펴보세요.</p></li>
      <li><h2>원문에서 무엇을 확인할 수 있나요?</h2><p>보고서의 표나 본문에서 수치와 단위를 찾고, 자료가 다루는 범위를 확인하세요.</p></li>
    </ol>
    <fieldset className="study-note classroom-exercise">
      <legend>이해 확인</legend>
      <p>도심 교통 정책을 도입한 뒤 지체 시간이 줄었다는 보고서를 읽었습니다. 효과를 해석하기 전에 무엇을 확인하면 좋을까요?</p>
      {answerOptions.map(({ label }, index) => <label key={label}>
        <input type="radio" name="reading-check" checked={answer === index} onChange={() => setAnswer(index)} />{label}
      </label>)}
      <p role="status">{answer !== null && answerOptions[answer].feedback}</p>
    </fieldset>
    <a className="primary" href={featured ? `#topic/${featured.id}` : "#learn"}>{featured ? "공개 정책에 적용해 보기" : "공개 정책 탐색"}</a>
  </section>;
}
