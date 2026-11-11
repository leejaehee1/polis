import type { Content, Source } from "./policy";

export const starterTopicId = "starter-london-congestion";
export const starterTopic: { content: Content; sources: Source[] } = {
  content: {
    category: "교통",
    title: "런던 혼잡통행료는 도로를 덜 막히게 했을까?",
    summary: "도심에 차량으로 들어갈 때 요금을 내도록 한 런던 사례를 살펴봅니다. 초기 효과와 이후 변화, 그리고 효과를 어떻게 측정하는지 비교해 보세요.",
    background: "런던은 2003년 도심의 교통 혼잡을 줄이기 위해 혼잡통행료를 도입했습니다. 런던교통공사는 도로에서 관측한 주행시간을 바탕으로 혼잡도를 추적했습니다.",
    results: "런던교통공사는 기존 도심 부과 구역의 부과 시간대에 1km당 추가 지체가 2003년과 2004년에는 약 1.6분으로, 도입 전인 2002년 대표값 2.3분보다 약 30% 낮았다고 보고했습니다. 같은 기준으로 2005년에는 22%, 2006년에는 8% 낮았습니다. [1]",
    limits: "2007년 추가 지체는 1km당 2.3분으로 2002년 대표값과 같았습니다. 2002년 실제 관측 평균은 2.5분이었으나 보고서는 당시 도로 공사의 영향을 고려해 2.3분을 비교 기준으로 삼았습니다. 보고서는 도로 공사와 도로 용량 변화가 이후 혼잡에 영향을 미쳤을 가능성을 제시합니다. 이 전후 비교만으로 통행료 자체의 효과를 분리하기는 어렵습니다. [1]",
    question: "우리 지역이 혼잡통행료를 검토한다면 어떤 지표를 먼저 측정해야 할까요? 대체 교통수단이 적은 주민의 부담은 어떻게 확인할 수 있을까요?",
  },
  sources: [{
    id: "tfl-sixth",
    title: "혼잡통행료 시행 영향 모니터링 6차 연차보고서",
    publisher: "런던교통공사",
    url: "https://content.tfl.gov.uk/central-london-congestion-charging-impacts-monitoring-sixth-annual-report.pdf",
    evidence: "2008년 7월 보고서 제4장 4.4절, 표 4.1(본문 57쪽)과 비교 기준 설명(58쪽). 기존 도심 부과 구역의 부과 시간대에 측정한 1km당 추가 지체를 비교합니다.",
  }],
};
