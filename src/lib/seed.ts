import type { Topic } from "./policy";
import { starterTopic } from "./starter";

export const seedTopic: Topic = {
  id: "london-congestion",
  draft: null,
  versions: [{
    id: "london-v1",
    number: 1,
    publishedAt: "2026-11-12T00:00:00.000Z",
    reason: "",
    ...starterTopic,
  }],
  comments: [], reports: [], audit: [],
};
