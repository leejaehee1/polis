import type { Topic } from "./policy";

export const seedTopic: Topic = {
  id: "london-congestion",
  draft: null,
  versions: [{
    id: "london-v1",
    number: 1,
    publishedAt: "2026-11-12T00:00:00.000Z",
    reason: "",
    content: {
      category: "교통",
      title: "런던 혼잡통행료는 도로를 덜 막히게 했을까?",
      summary: "도심에 차량으로 들어갈 때 요금을 내도록 한 런던 사례를 살펴봅니다. 초기 효과와 이후 변화, 그리고 효과를 어떻게 측정하는지 비교해 보세요.",
      background: "런던은 2003년 도심의 교통 혼잡을 줄이기 위해 혼잡통행료를 도입했습니다. 런던교통공사는 도로에서 관측한 주행시간을 바탕으로 혼잡도를 추적했습니다.",
      results: "런던교통공사는 제도 도입 초기 기존 부과 구역에서 혼잡도가 도입 전보다 최대 30%가량 낮았다고 보고했습니다. 여기서 혼잡도는 원활할 때에 비해 추가로 걸리는 주행시간을 뜻합니다. [1]",
      limits: "2007년 기존 부과 구역의 혼잡도는 도입 전 수준으로 돌아왔습니다. 보고서는 도로 공사와 도로 용량 변화 등이 영향을 주었을 가능성을 제시합니다. 관측된 변화만으로 통행료 자체의 효과를 분리하기는 어렵습니다. [1]",
      question: "우리 지역이 혼잡통행료를 검토한다면 어떤 지표를 먼저 측정해야 할까요? 대체 교통수단이 적은 주민의 부담은 어떻게 확인할 수 있을까요?",
    },
    sources: [{
      id: "tfl-sixth",
      title: "혼잡통행료 시행 영향 모니터링 6차 연차보고서",
      publisher: "런던교통공사",
      url: "https://content.tfl.gov.uk/central-london-congestion-charging-impacts-monitoring-sixth-annual-report.pdf",
      evidence: "제4장 4.4절. 제도 도입 초기와 2007년의 추가 주행시간을 비교합니다.",
    }],
  }],
  comments: [], reports: [], audit: [],
};
