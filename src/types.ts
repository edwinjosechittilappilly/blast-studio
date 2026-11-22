// Shared contracts for every module. Design: docs/design/blast-studio.md.

export const PLATFORM_IDS = [
  "devto",
  "hashnode",
  "gist",
  "github-discussion",
  "linkedin",
  "x",
  "bluesky",
  "mastodon",
  "threads",
  "reddit",
  "hn",
  "producthunt",
  "lemmy",
  "newsletter",
  "medium",
  "substack",
  "youtube-shorts",
  "instagram",
  "tiktok",
  "dailydev",
] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

/** What generated content a destination accepts (matches Market Blaster's `ai` policy). */
export type AiPolicy = "draft" | "outline" | "none";

/** A pack value with provenance; `unknown` when no verified source states it. */
export type Sourced<T> = { value: T; source: string; verified?: string; lastVerified?: string } | "unknown";

/** Disclosure rule per content kind: required rule text, recommended only, or unknown. */
export type DisclosureRule = { rule: string; source: string; verified?: string; lastVerified?: string; accepts?: string[] } | "recommended" | "unknown";

export type PostType =
  | "text"
  | "thread"
  | "article"
  | "image"
  | "carousel"
  | "diagram"
  | "poster"
  | "logo"
  | "video"
  | "terminal-demo";

export type AssetKind =
  | "card"
  | "poster"
  | "carousel"
  | "logo"
  | "diagram"
  | "video"
  | "terminal-demo"
  | "illustration"
  | "voiceover";

export interface Criterion {
  id: string;
  question: string;
  /** Relative weight in the platform score; default 1. */
  weight?: number;
  /** What a 0, 1 and 2 look like for this criterion, so different reviewers score the same post the same way. */
  anchors?: { "0": string; "1": string; "2": string };
  /** Post types this criterion applies to; omitted = all. Others score N/A. */
  appliesTo?: PostType[];
}

export interface MediaSpec {
  kind: "image" | "video" | "document" | "gif";
  /** e.g. ["1:1", "4:5", "1.91:1"] */
  aspectRatios?: Sourced<string[]>;
  maxBytes?: Sourced<number>;
  maxSeconds?: Sourced<number>;
  minSeconds?: Sourced<number>;
  maxCount?: Sourced<number>;
  width?: Sourced<number>;
  height?: Sourced<number>;
}

export interface PlatformPack {
  id: PlatformId;
  name: string;
  /** Market Blaster destination id, or null when Market Blaster cannot deliver (export folder + mark). */
  marketBlaster: string | null;
  ai: AiPolicy;
  aiSource?: string;
  aiLastVerified?: string;
  /** Post types worth producing here. */
  formats: PostType[];
  textLimit?: Sourced<number>;
  titleLimit?: Sourced<number>;
  media: MediaSpec[];
  disclosure: { text: DisclosureRule; media: DisclosureRule; voice: DisclosureRule };
  sponsorship?: DisclosureRule;
  rubric: Criterion[];
  /** Separate review for talking points handed to a human author. */
  outlineRubric?: Criterion[];
  /** Ids from platforms/sources.yml that govern this pack. */
  sources: string[];
  /** Warnings the reviewer always surfaces (e.g. text-heavy Reels). */
  notes?: string[];
}

export interface BrandKit {
  name: string;
  pitch?: string;
  audience?: string;
  voice?: string[];
  colors?: { ink?: string; paper?: string; accent?: string; accent2?: string };
  /** Font family names; files must be OFL in this repo or installed locally by the user. */
  fonts?: { display?: string; text?: string; mono?: string };
  logo?: string;
  links?: Record<string, string>;
}

export interface StudioConfig {
  /** Absolute path of the studio root (projects, ledger). */
  root: string;
  /** Path of the studio.yml this config came from. */
  file: string;
  brand: BrandKit;
  platforms: PlatformId[];
  agent: { command: string[]; timeoutSeconds: number; passEnv?: string[] };
  /** Reviewer agent; null = deterministic gates plus a human checklist only. */
  reviewer: { command: string[] | null; timeoutSeconds: number };
  review: { threshold: number; maxRounds: number };
  images: { provider: "gemini" | "openai" | "omp" | "none"; model?: string };
  voice: { provider: "openai" | "none"; model?: string; voice?: string };
  budget: { monthlyUsd: number; perProjectUsd: number };
  providers: { allowUpload: boolean };
  grounding: { waive: string[] };
  marketBlaster: { project?: string; command: string[] };
}

export type ClaimStatus = "shipped" | "planned" | "claim";

export interface BriefSection {
  anchor: string; // "E3"
  title: string;
  status?: ClaimStatus;
  body: string;
}

export interface PlanEntry {
  platform: PlatformId;
  type: PostType;
  angle: string;
  hooks: string[];
  assets: { id: string; kind: AssetKind; brief: string; aspect?: string }[];
}

export interface PostMedia {
  asset: string; // asset id
  file: string; // path relative to the project
  alt: string;
  kind: "image" | "video" | "document" | "gif";
}

export interface Post {
  platform: PlatformId;
  title?: string;
  evidence: string[];
  disclosure?: { text?: string; media?: string; voice?: string };
  media: PostMedia[];
  /** Thread items after the first post (exported as a handoff file). */
  thread?: string[];
  body: string;
  path: string;
}

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  provider: "template" | "mermaid" | "d2" | "arch-diagram" | "hyperframes" | "vhs" | "gemini" | "openai" | "omp";
  promptHash?: string;
  costUsd?: number | null;
  outputs: { file: string; width?: number; height?: number; seconds?: number; bytes: number; aspect?: string }[];
  license: string | null;
  aiGenerated: boolean;
  /** Asset ids this composite embeds; it inherits their aiGenerated flag. */
  embeds?: string[];
  /** Logos only: a human ran a trademark search. */
  trademarkChecked?: boolean;
  /** Render metrics per output (stills): smallest text, worst contrast (null when text sits on an image), overflow. */
  metrics?: { file: string; minFontPx: number; minContrast: number | null; overflow: boolean }[];
}

export interface GateResult {
  id: "policy" | "disclosure" | "specs" | "accessibility" | "fabricated-metrics" | "rights";
  pass: boolean;
  message: string;
  /** True when revision cannot fix it (e.g. missing rights on a provider asset). */
  unfixable?: boolean;
}

export interface ScoreResult {
  criterion: string;
  score: 0 | 1 | 2 | null; // null = N/A
  evidence: string;
  fix: string;
}

export type Verdict = "pass" | "revise" | "blocked" | "accepted";

export interface Review {
  platform: PlatformId;
  postHash: string;
  gates: GateResult[];
  warnings: string[];
  scores: ScoreResult[];
  /** Percent of applicable weighted points, 0-100; null when nothing applies. */
  total: number | null;
  verdict: Verdict;
  reviewer: string; // command or "deterministic"
  at: string;
  acceptedReason?: string;
}

export type Env = Record<string, string | undefined>;

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
