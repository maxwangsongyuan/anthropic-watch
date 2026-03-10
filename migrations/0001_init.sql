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
