import { Hono } from "hono";
import type { Env, NewItemWithSummary } from "./types";
import { SOURCES } from "./config";
import { fetchPage, fetchGoogleCSE } from "./fetcher";
import { parseSource } from "./parser";
import { findNewItems, getExistingTitles, saveNewItems, logCheck } from "./differ";
import { summarizeArticle, saveSummary } from "./summarizer";
import { sendLarkNotification } from "./notifier";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("anthropic-watch is running"));

app.get("/check", async (c) => {
  const results = await runCheck(c.env);
  return c.json(results);
});

app.get("/recent", async (c) => {
  const days = Number(c.req.query("days") ?? "7");
  const results = await c.env.DB.prepare(
    `SELECT ci.title, ci.url, ci.source_key, ci.discovered_at,
            s.summary, s.keywords_matched, s.relevance_score
     FROM content_items ci
     LEFT JOIN summaries s ON s.content_item_id = ci.id
     WHERE ci.discovered_at > datetime('now', '-' || ? || ' days')
     ORDER BY ci.discovered_at DESC`
  )
    .bind(days)
    .all();
  return c.json(results.results);
});

async function runCheck(env: Env): Promise<{ newItems: number; errors: string[] }> {
  const allNewItems: NewItemWithSummary[] = [];
  const errors: string[] = [];

  for (const source of SOURCES) {
    try {
      let parsed;
      if (source.type === "google-cse") {
        parsed = await fetchGoogleCSE(env);
      } else {
        const html = await fetchPage(source.url);
        parsed = parseSource(source.key, html);
      }

      const existing = await getExistingTitles(env.DB, source.key);
      const newItems = findNewItems(parsed, existing);

      await logCheck(env.DB, source.key, parsed.length, newItems.length);

      if (newItems.length > 0) {
        const ids = await saveNewItems(env.DB, source.key, newItems);

        for (let i = 0; i < newItems.length; i++) {
          const item = newItems[i];
          const newItem: NewItemWithSummary = {
            ...item,
            sourceKey: source.key,
            sourceName: source.name,
          };

          try {
            let articleText = item.title;
            if (item.url) {
              const fullPage = await fetchPage(item.url);
              articleText = fullPage
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 3000);
            }
            const summary = await summarizeArticle(env, articleText);
            newItem.summary = summary;

            if (ids[i]) {
              await saveSummary(env.DB, ids[i], summary);
            }
          } catch (err) {
            console.error(`Summary failed for "${item.title}":`, err);
          }

          allNewItems.push(newItem);
        }
      }

      console.log(`[${source.key}] found=${parsed.length} new=${newItems.length}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${source.key}: ${msg}`);
      console.error(`[${source.key}] error:`, msg);
      await logCheck(env.DB, source.key, 0, 0, msg);
    }
  }

  if (allNewItems.length > 0) {
    try {
      await sendLarkNotification(env.LARK_WEBHOOK_URL, allNewItems);
      console.log(`Notified: ${allNewItems.length} new items`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`notification: ${msg}`);
      console.error("Lark notification failed:", msg);
    }
  }

  return { newItems: allNewItems.length, errors };
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCheck(env));
  },
};
