# anthropic-watch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Cloudflare Worker that monitors 8 Anthropic content sources every 6 hours, detects new content, generates AI summaries, and sends Lark notifications.

**Architecture:** Single Worker with cron trigger → fetch pages → parse titles → diff against D1 → Workers AI summarize new items → Lark webhook notify. D1 stores all snapshots and summaries.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), Workers AI (Llama 3.3 70B), TypeScript, Vitest, Hono (for manual trigger endpoint)

**Ref:** Design doc at `docs/plans/2026-03-10-anthropic-watch-design.md`

---

## Task 0: GitHub Repo + Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.toml`, `vitest.config.ts`, `.gitignore`
- Create: `src/index.ts` (empty worker entry)

**Step 1: Create GitHub repo**

```bash
cd /Users/maxwsy/workspace/anthropic-watch
gh repo create maxwangsongyuan/anthropic-watch --public \
  --description "Monitor Anthropic content updates with AI summaries — Cloudflare Workers + D1" \
  --source=. --push
```

**Step 2: Initialize project**

```bash
npm init -y
npm install hono
npm install -D wrangler @cloudflare/workers-types @cloudflare/vitest-pool-workers vitest typescript
```

**Step 3: Create wrangler.toml**

```toml
name = "anthropic-watch"
main = "src/index.ts"
compatibility_date = "2026-03-10"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 */6 * * *"]

[[d1_databases]]
binding = "DB"
database_name = "anthropic-watch"
database_id = "TBD"

[ai]
binding = "AI"

[vars]
INTEREST_KEYWORDS = "agents,skills,MCP,Claude Code,prompt engineering,tool use,context engineering,agentic coding,multi-agent,evaluation"

[observability]
enabled = true
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 5: Create vitest.config.ts**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

**Step 6: Create minimal src/index.ts**

```ts
export default {
  async fetch(): Promise<Response> {
    return new Response("anthropic-watch is running");
  },
  async scheduled(): Promise<void> {
    console.log("cron triggered");
  },
};
```

**Step 7: Create .gitignore**

```
node_modules/
dist/
.wrangler/
.dev.vars
```

**Step 8: Verify local dev works**

Run: `npx wrangler dev`
Expected: Worker starts on localhost, returns "anthropic-watch is running"

**Step 9: Commit and push**

```bash
git init && git add -A
git commit -m "chore: scaffold anthropic-watch project"
git branch -M main
git remote add origin https://github.com/maxwangsongyuan/anthropic-watch.git
git push -u origin main
```

---

## Task 1: Types + Config

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`

**Step 1: Create src/types.ts**

```ts
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
```

**Step 2: Create src/config.ts**

```ts
import type { SourceConfig } from "./types";

export const SOURCES: SourceConfig[] = [
  {
    key: "news",
    url: "https://www.anthropic.com/news",
    name: "Anthropic News",
    type: "html",
  },
  {
    key: "eng",
    url: "https://www.anthropic.com/engineering",
    name: "Engineering Blog",
    type: "html",
  },
  {
    key: "learn",
    url: "https://www.anthropic.com/learn",
    name: "Learning Resources",
    type: "html",
  },
  {
    key: "alignment",
    url: "https://alignment.anthropic.com",
    name: "Alignment Blog",
    type: "html",
  },
  {
    key: "releases",
    url: "https://docs.anthropic.com/en/release-notes/overview",
    name: "API Release Notes",
    type: "html",
  },
  {
    key: "courses",
    url: "https://claude.com/resources/courses",
    name: "Anthropic Courses",
    type: "html",
  },
  {
    key: "events",
    url: "https://www.anthropic.com/events",
    name: "Events & Webinars",
    type: "html",
  },
  {
    key: "pdfs",
    url: "",
    name: "New PDFs & Guides",
    type: "google-cse",
  },
];
```

**Step 3: Commit**

```bash
git add src/types.ts src/config.ts
git commit -m "feat: add type definitions and source config"
```

---

## Task 2: D1 Schema + Migration

**Files:**
- Create: `migrations/0001_init.sql`
- Create: `migrations/0002_seed_sources.sql`

**Step 1: Create D1 database**

```bash
wrangler d1 create anthropic-watch
```

Copy the returned `database_id` into `wrangler.toml`.

**Step 2: Create migrations/0001_init.sql**

```sql
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    name TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_checked_at TEXT
);

CREATE TABLE IF NOT EXISTS content_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    discovered_at TEXT DEFAULT (datetime('now')),
    content_hash TEXT,
    UNIQUE(source_key, title)
);

CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_item_id INTEGER REFERENCES content_items(id),
    summary TEXT,
    keywords_matched TEXT,
    relevance_score INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS check_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checked_at TEXT DEFAULT (datetime('now')),
    source_key TEXT NOT NULL,
    items_found INTEGER DEFAULT 0,
    new_items INTEGER DEFAULT 0,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_source ON content_items(source_key);
CREATE INDEX IF NOT EXISTS idx_content_discovered ON content_items(discovered_at);
CREATE INDEX IF NOT EXISTS idx_checklog_time ON check_log(checked_at);
```

**Step 3: Create migrations/0002_seed_sources.sql**

```sql
INSERT OR IGNORE INTO sources (key, url, name) VALUES
  ('news', 'https://www.anthropic.com/news', 'Anthropic News'),
  ('eng', 'https://www.anthropic.com/engineering', 'Engineering Blog'),
  ('learn', 'https://www.anthropic.com/learn', 'Learning Resources'),
  ('alignment', 'https://alignment.anthropic.com', 'Alignment Blog'),
  ('releases', 'https://docs.anthropic.com/en/release-notes/overview', 'API Release Notes'),
  ('courses', 'https://claude.com/resources/courses', 'Anthropic Courses'),
  ('events', 'https://www.anthropic.com/events', 'Events & Webinars'),
  ('pdfs', 'https://www.googleapis.com/customsearch/v1', 'New PDFs & Guides');
```

**Step 4: Apply migration locally**

```bash
wrangler d1 migrations apply anthropic-watch --local
```

**Step 5: Commit**

```bash
git add migrations/ wrangler.toml
git commit -m "feat: add D1 schema and seed data"
```

---

## Task 3: Parser — Extract Titles from HTML

**Files:**
- Create: `src/parser.ts`
- Create: `test/parser.test.ts`

**Step 1: Write failing tests with real HTML snapshots**

Create `test/parser.test.ts` using simplified HTML matching real page structure (from Tavily research):

```ts
import { describe, it, expect } from "vitest";
import { parseSource } from "../src/parser";

const NEWS_HTML = `
<a href="/news/claude-sonnet-4-6"><span>Product</span><h4>Introducing Claude Sonnet 4.6</h4></a>
<a href="/news/claude-code-security"><span>Announcements</span><h4>Making frontier cybersecurity capabilities available to defenders</h4></a>
`;

const ENG_HTML = `
<div>Building a C compiler with a team of parallel Claudes</div>
<div>Designing AI-resistant technical evaluations</div>
<div>Demystifying evals for AI agents</div>
`;

const COURSES_HTML = `
Introduction to agent skills
AI Fluency: Framework & Foundations
Building with the Claude API
Claude Code in Action
Introduction to Model Context Protocol
Claude 101
`;

describe("parseSource", () => {
  it("extracts news titles and links", () => {
    const items = parseSource("news", NEWS_HTML);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].title).toContain("Claude Sonnet 4.6");
    expect(items[0].url).toContain("/news/");
  });

  it("extracts engineering blog titles", () => {
    const items = parseSource("eng", ENG_HTML);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((i) => i.title.includes("C compiler"))).toBe(true);
  });

  it("extracts course names", () => {
    const items = parseSource("courses", COURSES_HTML);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.some((i) => i.title.includes("Claude Code"))).toBe(true);
  });

  it("returns empty array for empty HTML", () => {
    const items = parseSource("news", "");
    expect(items).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/parser.test.ts`
Expected: FAIL — `parseSource` not defined

**Step 3: Implement parser**

Create `src/parser.ts` with per-source extraction logic using regex (no DOM parser needed). Each source page has a different HTML structure. Patterns are based on the actual HTML fetched via Tavily during research.

Key design decisions:
- Regex-based, no heavy DOM library needed in Workers
- Each source gets its own parse function
- Dedup by title (case-insensitive)
- Will need tuning after first real fetch (Task 10)

**Step 4: Run tests — expect PASS**

Run: `npx vitest run test/parser.test.ts`

**Step 5: Commit**

```bash
git add src/parser.ts test/parser.test.ts
git commit -m "feat: add HTML parser for all 7 source types"
```

---

## Task 4: Differ — Compare New Items Against D1

**Files:**
- Create: `src/differ.ts`
- Create: `test/differ.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { findNewItems } from "../src/differ";

describe("findNewItems", () => {
  it("returns items not in existing set", () => {
    const parsed = [
      { title: "Article A", url: "https://example.com/a" },
      { title: "Article B", url: "https://example.com/b" },
      { title: "Article C", url: "https://example.com/c" },
    ];
    const existing = new Set(["article a", "article b"]);
    const newItems = findNewItems(parsed, existing);
    expect(newItems).toHaveLength(1);
    expect(newItems[0].title).toBe("Article C");
  });

  it("returns all items when no existing", () => {
    const parsed = [{ title: "Article A" }, { title: "Article B" }];
    const newItems = findNewItems(parsed, new Set());
    expect(newItems).toHaveLength(2);
  });

  it("returns empty when all exist", () => {
    const parsed = [{ title: "Article A" }];
    const existing = new Set(["article a"]);
    expect(findNewItems(parsed, existing)).toHaveLength(0);
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement differ**

`src/differ.ts` exports:
- `findNewItems(parsed, existingTitles)` — pure function, returns items not in set
- `getExistingTitles(db, sourceKey)` — D1 query, returns Set of lowercase titles
- `saveNewItems(db, sourceKey, items)` — INSERT OR IGNORE into content_items
- `logCheck(db, sourceKey, found, new, error?)` — INSERT into check_log

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add src/differ.ts test/differ.test.ts
git commit -m "feat: add differ for D1 snapshot comparison"
```

---

## Task 5: Fetcher — Fetch Pages + Google CSE

**Files:**
- Create: `src/fetcher.ts`

**Step 1: Implement fetcher**

`src/fetcher.ts` exports:
- `fetchPage(url)` — simple fetch with User-Agent header, returns HTML string
- `fetchGoogleCSE(env)` — calls Google Custom Search API with `site:resources.anthropic.com/hubfs filetype:pdf`, returns ParsedItem[]

Graceful handling: if Google CSE credentials not set, skip and return empty array.

**Step 2: Commit**

```bash
git add src/fetcher.ts
git commit -m "feat: add page fetcher and Google CSE client"
```

---

## Task 6: Summarizer — Workers AI Integration

**Files:**
- Create: `src/summarizer.ts`
- Create: `test/summarizer.test.ts`

**Step 1: Write test for keyword matching (unit-testable part)**

```ts
import { describe, it, expect } from "vitest";
import { extractKeywordMatches, buildSummaryPrompt } from "../src/summarizer";

describe("extractKeywordMatches", () => {
  it("finds matching keywords in text", () => {
    const text = "This article covers MCP and agent skills for Claude Code";
    const keywords = ["agents", "skills", "MCP", "Claude Code"];
    const matches = extractKeywordMatches(text, keywords);
    expect(matches).toContain("MCP");
    expect(matches).toContain("skills");
    expect(matches).toContain("Claude Code");
  });

  it("returns empty for no matches", () => {
    const text = "Company financial results for Q4";
    const keywords = ["agents", "skills", "MCP"];
    expect(extractKeywordMatches(text, keywords)).toEqual([]);
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement summarizer**

`src/summarizer.ts` exports:
- `extractKeywordMatches(text, keywords)` — pure function
- `buildSummaryPrompt(articleText, keywords)` — builds prompt for Workers AI
- `summarizeArticle(env, articleText)` — calls Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, returns Summary
- `saveSummary(db, contentItemId, summary)` — INSERT into summaries table

AI prompt asks for JSON `{"summary": "...", "relevance": N}`. Fallback to raw text if JSON parse fails. Truncate input to ~2000 chars to stay within token budget.

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add src/summarizer.ts test/summarizer.test.ts
git commit -m "feat: add Workers AI summarizer with keyword matching"
```

---

## Task 7: Notifier — Lark Webhook

**Files:**
- Create: `src/notifier.ts`
- Create: `test/notifier.test.ts`

**Step 1: Write test for card building**

Test `buildLarkCard()` with mock items — verify card structure, grouping by source, includes summary/keywords/relevance/links.

**Step 2: Run test — expect FAIL**

**Step 3: Implement notifier**

`src/notifier.ts` exports:
- `buildLarkCard(items)` — builds Lark interactive card JSON, groups items by source
- `sendLarkNotification(webhookUrl, items)` — POST card to webhook, no-op if items empty

Card format: header with count → sections per source → each item shows title, AI summary, keywords, relevance score, link.

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add src/notifier.ts test/notifier.test.ts
git commit -m "feat: add Lark webhook notifier with card builder"
```

---

## Task 8: Main Handler — Wire Everything Together

**Files:**
- Modify: `src/index.ts`

**Step 1: Implement the full handler**

Wire up: Hono app with routes:
- `GET /` — health check
- `GET /check` — manual trigger (same as cron)
- `GET /recent?days=7` — query recent discoveries from D1

Cron handler (`scheduled`): loops through SOURCES, for each:
1. Fetch page (or Google CSE for pdfs)
2. Parse items
3. Diff against D1
4. For new items: fetch full article → Workers AI summarize → save to D1
5. Collect all new items
6. Send single Lark notification with all new items

Error handling: per-source try/catch, log errors, continue to next source.

**Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire up cron handler with all modules"
```

---

## Task 9: Local Dev Test + First Deploy

**Step 1: Create .dev.vars for local secrets**

Create `.dev.vars` (git-ignored):
```
LARK_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_HOOK_ID
GOOGLE_CSE_API_KEY=your_key
GOOGLE_CSE_CX=your_cx
```

**Step 2: Apply D1 migration to remote**

```bash
wrangler d1 migrations apply anthropic-watch --remote
```

**Step 3: Test locally**

```bash
npx wrangler dev
# Then: curl http://localhost:8787/check
```

Expected: JSON response with `{ "newItems": N, "errors": [] }`.
First run detects ALL items as "new" — this is the initial seed.

**Step 4: Set production secrets**

```bash
wrangler secret put LARK_WEBHOOK_URL
wrangler secret put GOOGLE_CSE_API_KEY
wrangler secret put GOOGLE_CSE_CX
```

**Step 5: Deploy**

```bash
wrangler deploy
```

**Step 6: Trigger manual check to seed D1**

```bash
curl https://anthropic-watch.<subdomain>.workers.dev/check
```

**Step 7: Verify Lark notification received**

Check Lark/Feishu group for the notification card.

**Step 8: Commit final adjustments and push**

```bash
git add -A && git commit -m "chore: finalize config and deploy"
git push
```

---

## Task 10: Parser Tuning (Post-Deploy)

After first real fetch, parsers will likely need tuning based on actual HTML.

**Step 1:** Query `/recent?days=1` to see what was parsed
**Step 2:** Compare against actual pages, identify misses/false positives
**Step 3:** Update regex patterns in `src/parser.ts` + test snapshots
**Step 4:** Redeploy with `wrangler deploy`
**Step 5:** Commit

```bash
git add -A && git commit -m "fix: tune parsers based on real HTML"
git push
```

---

## Summary

| Task | What | Est. |
|------|------|------|
| 0 | Scaffold + GitHub repo | 10 min |
| 1 | Types + Config | 5 min |
| 2 | D1 Schema + Migration | 10 min |
| 3 | Parser (TDD) | 20 min |
| 4 | Differ (TDD) | 10 min |
| 5 | Fetcher | 5 min |
| 6 | Summarizer (TDD) | 15 min |
| 7 | Notifier (TDD) | 10 min |
| 8 | Main Handler | 15 min |
| 9 | Local test + Deploy | 15 min |
| 10 | Parser tuning | 15 min |
