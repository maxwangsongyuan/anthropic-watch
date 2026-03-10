-- Recreate content_items with COLLATE NOCASE on title for case-insensitive uniqueness
CREATE TABLE IF NOT EXISTS content_items_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key TEXT NOT NULL,
    title TEXT NOT NULL COLLATE NOCASE,
    url TEXT,
    discovered_at TEXT DEFAULT (datetime('now')),
    content_hash TEXT,
    UNIQUE(source_key, title)
);

INSERT OR IGNORE INTO content_items_new (id, source_key, title, url, discovered_at, content_hash)
  SELECT id, source_key, title, url, discovered_at, content_hash FROM content_items;

DROP TABLE content_items;
ALTER TABLE content_items_new RENAME TO content_items;

CREATE INDEX IF NOT EXISTS idx_content_source ON content_items(source_key);
CREATE INDEX IF NOT EXISTS idx_content_discovered ON content_items(discovered_at);
