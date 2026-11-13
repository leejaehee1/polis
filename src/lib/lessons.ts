import type { Content } from "./policy";
import { starterTopic } from "./starter";

export const lessonKeys = ["traffic-delay", "before-after", "costs-benefits"] as const;
export type LessonKey = typeof lessonKeys[number];

const lessons: Record<LessonKey, Pick<Content, "title" | "summary" | "background" | "results" | "limits" | "question"> & Omit<NonNullable<Content["lesson"]>, "policyId">> = {
  "traffic-delay": {
    title: "차가 줄면 길도 덜 막힐까?",
    summary: "통행량과 지체 시간을 구분할 수 있습니다.",
    background: "통행량은 일정 시간에 특정 지점을 지나간 차량 수입니다. 지체 시간은 교통이 원활할 때에 비해 더 걸린 시간입니다.",
    results: "런던교통공사는 기존 도심 부과 구역에서 1km를 달릴 때 추가로 걸린 시간을 조사했습니다. 2003년과 2004년에는 약 1.6분이었습니다. [1]",
    question: "도심 진입 차량이 줄었습니다. 도로 위 지체 시간도 줄었는지 확인하려면 어떤 자료가 필요할까요?",
    correct: "같은 도로와 시간대에서 측정한 주행시간 자료",
    incorrect: "도심 부과 구역을 통과한 차량 수만 집계한 자료",
    limits: "같은 도로와 시간대의 주행시간을 비교하고, 원활할 때의 기준 주행시간을 확인해야 지체 시간을 해석할 수 있습니다.",
    section: "results",
  },
  "before-after": {
    title: "정책 시행 전후가 다르면 정책 효과일까?",
    summary: "전후 관측값과 정책의 효과를 구분할 수 있습니다.",
    background: "전후 비교는 무엇이 달라졌는지 보여줍니다. 정책의 영향을 해석하려면 같은 시기에 달라진 다른 조건도 살펴야 합니다.",
    results: "런던교통공사는 2002년 실제 관측 평균 2.5분/km를 기록했습니다. 당시 도로 공사의 영향을 고려해 시행 전 비교에는 2.3분/km를 대표값으로 사용했습니다. [1]",
    question: "통행료 도입과 도로 공사 시기가 겹쳤습니다. 전후 수치를 해석하려면 무엇을 먼저 확인하면 좋을까요?",
    correct: "공사 구간과 기간, 조사 방법, 공사 영향을 덜 받은 도로의 변화",
    incorrect: "시행 후 수치가 낮아졌는지만 확인하고 그 차이를 통행료 효과로 계산한다.",
    limits: "공사 구간과 조사 조건을 알면 어떤 요인이 관측값에 영향을 줬을지 따져볼 수 있습니다. 비교 도로도 출발 조건과 변화 양상이 비슷한지 확인해야 합니다.",
    section: "limits",
  },
  "costs-benefits": {
    title: "정책의 비용과 혜택은 누구에게 돌아갈까?",
    summary: "도시 전체의 평균과 주민 집단별 영향을 구분할 수 있습니다.",
    background: "집단별 영향은 정책의 비용이나 혜택이 사람마다 어떻게 달라지는지를 말합니다. 같은 요금도 이동을 바꾸기 쉬운 사람과 어려운 사람에게 다른 부담이 될 수 있습니다.",
    results: "런던 사례를 바탕으로 생각해 봅시다. 두 통근자 중 한 사람은 버스를 이용할 수 있고, 다른 사람은 출근 시간에 이용할 대중교통이 거의 없다고 가정합니다. [1]의 지체 시간 자료만으로는 두 사람의 부담을 알기 어렵습니다.",
    question: "대체 교통수단이 적은 주민의 부담을 확인하려면 어떤 자료를 모으면 좋을까요?",
    correct: "지역별 대중교통 운행 시간과 접근성, 주민의 요금 부담 자료",
    incorrect: "도시 전체의 평균 차량 통행량만 집계한 자료",
    limits: "대중교통을 언제 어디서 이용할 수 있는지와 요금이 가구에 어느 정도 부담인지 함께 봐야 합니다. 평균 통행량으로는 이런 차이를 확인하기 어렵습니다.",
    section: "discussion",
  },
};

export function starterLesson(key: LessonKey, policyId: string) {
  const { correct, incorrect, section, ...content } = lessons[key];
  return {
    content: { ...content, category: "교통", lesson: { policyId, correct, incorrect, section } } satisfies Content,
    sources: starterTopic.sources,
  };
}
