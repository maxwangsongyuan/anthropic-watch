import type { ParsedItem } from "./types";

export function findNewItems(
  parsed: ParsedItem[],
  existingTitles: Set<string>
): ParsedItem[] {
  return parsed.filter(
    (item) => !existingTitles.has(item.title.toLowerCase())
  );
}

export async function getExistingTitles(
  db: D1Database,
  sourceKey: string
): Promise<Set<string>> {
  const result = await db
    .prepare("SELECT title FROM content_items WHERE source_key = ?")
    .bind(sourceKey)
    .all<{ title: string }>();
  return new Set(result.results.map((r) => r.title.toLowerCase()));
}

export async function saveNewItems(
  db: D1Database,
  sourceKey: string,
  items: ParsedItem[]
): Promise<(number | null)[]> {
  const ids: (number | null)[] = [];
  for (const item of items) {
    const result = await db
      .prepare(
        "INSERT OR IGNORE INTO content_items (source_key, title, url) VALUES (?, ?, ?)"
      )
      .bind(sourceKey, item.title, item.url ?? null)
      .run();
    ids.push(result.meta.last_row_id || null);
  }
  return ids;
}

export async function logCheck(
  db: D1Database,
  sourceKey: string,
  itemsFound: number,
  newItems: number,
  error?: string
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO check_log (source_key, items_found, new_items, error) VALUES (?, ?, ?, ?)"
    )
    .bind(sourceKey, itemsFound, newItems, error ?? null)
    .run();
  await db
    .prepare("UPDATE sources SET last_checked_at = datetime('now') WHERE key = ?")
    .bind(sourceKey)
    .run();
}
