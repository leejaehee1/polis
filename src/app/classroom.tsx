import { useState } from "react";
import type { PublicTopic } from "@/lib/policy";

export function CivicClassroom({ lessons, policies, selected, returnVersion }: {
  lessons?: PublicTopic[]; policies: PublicTopic[]; selected?: string; returnVersion?: number;
}) {
  const topic = lessons?.find((item) => item.id === selected);
  const record = topic?.versions.at(-1);
  const lesson = record?.content.lesson;

  if (selected && record && lesson) {
    const policy = policies.find((item) => item.id === lesson.policyId);
    const policyVersion = policy?.versions.find((item) => item.number === returnVersion) ?? policy?.versions.at(-1);
    return <article className="page narrow classroom">
      <a className="back" href="#classroom">‹ 시민 교실</a>
      <h1>{record.content.title}</h1>
      <p className="lead">{record.content.summary}</p>
      <section className="section-rule"><h2>개념 읽기</h2><p>{record.content.background}</p></section>
      <section className="section-rule"><h2>사례로 확인하기</h2><p>{record.content.results}</p></section>
      <Exercise question={record.content.question} correct={lesson.correct} incorrect={lesson.incorrect} correctFirst={lesson.section === "limits"} explanation={record.content.limits} />
      <section className="section-rule">
        <h2>근거 자료</h2>
        <ol className="sources">{record.sources.map((source) => <li key={source.id}>
          <a href={source.url}>{source.title}</a><p>{source.publisher} · {source.evidence}</p>
        </li>)}</ol>
      </section>
      {policy && policyVersion && <a className="primary" href={`#topic/${policy.id}/${policyVersion.number}/${lesson.section}`}>정책 글에 적용하기</a>}
    </article>;
  }

  return <section className="page narrow classroom">
    <h1>시민 교실</h1>
    <p className="lead">정책 글에서 만나는 개념을 3분 수업으로 익히고, 짧은 문제로 확인하세요.</p>
    {!lessons ? <p role="status">수업을 불러오는 중입니다.</p> : selected ? <p>수업을 찾을 수 없습니다. <a href="#classroom">수업 목록 보기</a></p>
      : lessons.length === 0 ? <p>검수와 발행을 마친 수업이 여기에 표시됩니다.</p>
      : <ul className="reading-steps">{lessons.map((item) => {
        const { content } = item.versions.at(-1)!;
        return <li key={item.id}><h2><a href={`#classroom/${item.id}`}>{content.title}</a></h2>
          <p>약 3분 · {content.summary}</p></li>;
      })}</ul>}
  </section>;
}

function Exercise({ question, correct, incorrect, explanation, correctFirst }: {
  question: string; correct: string; incorrect: string; explanation: string; correctFirst: boolean;
}) {
  const [answer, setAnswer] = useState<string>();
  return <fieldset className="study-note classroom-exercise">
    <legend>이해 확인</legend>
    <p>{question}</p>
    {(correctFirst ? [correct, incorrect] : [incorrect, correct]).map((option) => <label key={option}>
      <input type="radio" name="lesson-answer" checked={answer === option} onChange={() => setAnswer(option)} />{option}
    </label>)}
    <p role="status">{answer && `${answer === correct ? "맞습니다." : "다시 생각해 보세요."} ${explanation}`}</p>
  </fieldset>;
}
