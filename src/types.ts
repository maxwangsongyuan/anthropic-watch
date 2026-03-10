export interface SourceConfig {
  key: string;
  url: string;
  name: string;
  type: "html" | "google-cse";
}

export interface ParsedItem {
  title: string;
  url?: string;
  date?: string;
}

export interface NewItem extends ParsedItem {
  sourceKey: string;
  sourceName: string;
}

export interface Summary {
  text: string;
  keywordsMatched: string[];
  relevanceScore: number;
}

export interface NewItemWithSummary extends NewItem {
  summary?: Summary;
}

export interface Env {
  DB: D1Database;
  AI: Ai;
  LARK_WEBHOOK_URL: string;
  GOOGLE_CSE_API_KEY: string;
  GOOGLE_CSE_CX: string;
  INTEREST_KEYWORDS: string;
}
