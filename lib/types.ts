export const WORKER_IDS = [
  "portfolio-strategy",
  "product-marketing",
  "market-intelligence",
  "brand-director",
  "content-copy",
  "social-media",
  "creative-director",
  "video-reels",
  "pr-corporate-comms",
  "growth-performance",
  "seo-organic",
  "crm-lifecycle",
  "partnerships-influencer",
  "community-marketing",
  "marketing-operations",
  "marketing-analytics",
  "qa-brand-risk"
] as const;

export type WorkerId = (typeof WORKER_IDS)[number];

export type Stage =
  | "research"
  | "strategy"
  | "production"
  | "review"
  | "operations"
  | "measurement";

export type StrategyStatus =
  | "draft"
  | "under_review"
  | "ceo_approved"
  | "active"
  | "paused"
  | "archived"
  | "unknown";

export type Importance = "standard" | "important" | "sensitive";

export interface RuntimeRequest {
  project: string;
  objective: string;
  stage: Stage;
  strategyStatus?: StrategyStatus;
  importance?: Importance;
  context?: string;
  requestedWorkerIds?: WorkerId[];
  autoCorrect?: boolean;
}

export interface WorkerDefinition {
  id: WorkerId;
  name: string;
  mission: string;
  boundaries: string;
}

export interface TraceEvent {
  at: string;
  event: string;
  workerId?: string;
  detail?: string;
}
