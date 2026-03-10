# anthropic-watch Design Document

> Date: 2026-03-10
> Status: Approved
> Author: Max Wang + Claude

## Problem

Anthropic publishes content across 8+ domains/subdomains with no unified RSS feed. Key resources (PDFs on `resources.anthropic.com/hubfs/`, alignment blog posts, new courses) are easily missed — sometimes discovered weeks late.

## Solution

A Cloudflare Worker that runs on a cron schedule, fetches target pages, detects new content via D1 snapshot comparison, generates AI summaries with relevance scoring, and pushes notifications to Lark (Feishu).

## Architecture

```
Cron Trigger (0 */6 * * *)
  → Worker: anthropic-watch
    → Fetcher: fetch 8 target URLs + Google CSE for PDFs
    → Parser: extract titles/links from each page
    → Differ: compare against D1 snapshots, find new items
    → Summarizer: Workers AI reads new article content, generates summary
    → Scorer: match summary against interest keywords, highlight relevance
    → Notifier: send Lark webhook with new items + AI summaries
    → Store: update D1 with new snapshots + summaries
```

## Monitored Sources

| Key | URL | Extract | Diff Logic |
|-----|-----|---------|------------|
| `news` | anthropic.com/news | Article titles + links | New title appears |
| `eng` | anthropic.com/engineering | Article titles + dates | New title appears |
| `learn` | anthropic.com/learn | Course/resource names | New name appears |
| `alignment` | alignment.anthropic.com | Article titles + links | New title appears |
| `releases` | docs.anthropic.com/en/release-notes/overview | Latest date entries | New date entry |
| `courses` | claude.com/resources/courses | Course name list | New course appears |
| `events` | anthropic.com/events | Event names + dates | New event appears |
| `pdfs` | Google CSE query | PDF URL list | New URL appears |

## Storage: D1

### Schema

```sql
CREATE TABLE sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    name TEXT,
    enabled BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_checked_at TEXT
);

CREATE TABLE content_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    discovered_at TEXT DEFAULT (datetime('now')),
    content_hash TEXT,
    UNIQUE(source_key, title)
);

CREATE TABLE summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_item_id INTEGER REFERENCES content_items(id),
    summary TEXT,
    keywords_matched TEXT,  -- JSON array of matched keywords
    relevance_score INTEGER DEFAULT 0,  -- 0-10
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE check_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checked_at TEXT DEFAULT (datetime('now')),
    source_key TEXT NOT NULL,
    items_found INTEGER DEFAULT 0,
    new_items INTEGER DEFAULT 0,
    error TEXT
);
```

### Why D1 over KV

- Historical queries: "what changed this week", "all PDFs discovered this month"
- AI summaries worth preserving — don't want to re-generate
- UptimeFlare (3.4k stars) migrated from KV to D1 for same reasons
- D1 free tier is equally generous (5M reads/day, 100K writes/day)
- Migration tax avoided — start with D1, never need to move

## AI Summarization: Workers AI

- Model: Llama 3.3 70B (free tier: 10K tokens/day)
- Only triggered for NEW content (not on every check)
- Input: fetched article HTML → cleaned text
- Prompt includes interest keywords for relevance scoring
- Output: 2-3 sentence summary + matched keywords + relevance score (0-10)
- Token budget: ~8 articles/day max (most checks find 0-1 new items)

### Interest Keywords (configurable in wrangler.toml vars)

```
agents, skills, MCP, Claude Code, prompt engineering,
tool use, context engineering, agentic coding,
multi-agent, evaluation, benchmarks
```

## Notification: Lark Webhook

### Card Format

```
🔔 Anthropic Watch — N new items

━━━ Engineering Blog ━━━
📄 "Article Title"
💡 AI Summary: [2-3 sentences]
🎯 Keywords: agents, MCP
⭐ Relevance: 8/10
🔗 Link

━━━ New PDF ━━━
📄 "PDF Title"
💡 AI Summary: [2-3 sentences]
🎯 Keywords: skills, agentic coding
⭐ Relevance: 9/10
🔗 Link
```

## Error Handling

- Single URL fetch failure → skip, log to check_log, continue others
- Workers AI failure → send notification without summary (title + link only)
- Lark webhook failure → log error; next check will re-detect (D1 not updated on notify failure)
- Google CSE quota exceeded → skip PDF check, log warning

## Scaling Plan

| Scale | Strategy |
|-------|----------|
| 8 URLs (now) | Single Worker, Pattern A |
| 40+ URLs | Still single Worker (40 of 50 subrequest budget) |
| 50+ URLs | Shard into 2 Workers, or upgrade to $5/month paid |
| 100+ URLs | $5/month paid plan (10K subrequests) |

## Project Structure

```
anthropic-watch/
├── src/
│   ├── index.ts          # Worker entry, cron handler
│   ├── config.ts         # Source definitions, keywords
│   ├── fetcher.ts        # URL fetching + content extraction per source
│   ├── parser.ts         # HTML parsing, title/link extraction
│   ├── differ.ts         # D1 snapshot comparison, find new items
│   ├── summarizer.ts     # Workers AI integration
│   ├── notifier.ts       # Lark webhook card builder + sender
│   └── types.ts          # Shared type definitions
├── migrations/
│   └── 0001_init.sql     # D1 schema
├── wrangler.toml
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Secrets & Bindings

```toml
# wrangler.toml
name = "anthropic-watch"
main = "src/index.ts"
compatibility_date = "2026-03-10"

[triggers]
crons = ["0 */6 * * *"]

[[d1_databases]]
binding = "DB"
database_name = "anthropic-watch"
database_id = "<created-at-deploy-time>"

[ai]
binding = "AI"

[vars]
INTEREST_KEYWORDS = "agents,skills,MCP,Claude Code,prompt engineering,tool use,context engineering,agentic coding,multi-agent,evaluation"

# Secrets (via `wrangler secret put`):
# LARK_WEBHOOK_URL
# GOOGLE_CSE_API_KEY
# GOOGLE_CSE_CX
```

## External Service Setup Required

1. **Google Programmable Search Engine** — create at programmablesearchengine.google.com, restrict to `resources.anthropic.com/hubfs`
2. **Lark/Feishu Webhook** — create incoming webhook bot in target group
3. **Cloudflare D1** — `wrangler d1 create anthropic-watch`

## Cost

$0. Everything on free tier:
- Workers: 4 invocations/day (of 100K/day limit)
- D1: ~200 reads + ~50 writes per day (of 5M + 100K limits)
- Workers AI: ~2K tokens/day avg (of 10K/day limit)
- Google CSE: 4 queries/day (of 100/day limit)
