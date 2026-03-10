import type { ParsedItem } from "./types";

/**
 * Parse HTML from a given source and extract content items.
 * Dispatches to per-source parsers based on sourceKey.
 * Returns deduplicated ParsedItem[] (case-insensitive by title).
 */
export function parseSource(sourceKey: string, html: string): ParsedItem[] {
  if (!html.trim()) return [];

  let items: ParsedItem[];

  switch (sourceKey) {
    case "news":
      items = parseNews(html);
      break;
    case "eng":
      items = parseEng(html);
      break;
    case "learn":
      items = parseLearn(html);
      break;
    case "alignment":
      items = parseAlignment(html);
      break;
    case "releases":
      items = parseReleases(html);
      break;
    case "courses":
      items = parseCourses(html);
      break;
    case "events":
      items = parseEvents(html);
      break;
    default:
      return [];
  }

  return dedup(items);
}

// ── Per-source parsers ──

/**
 * anthropic.com/news
 * Pattern: <a href="/news/slug">...<h4>Title</h4></a>
 */
function parseNews(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  // Match <a> tags with href="/news/..." that contain an <h4> title
  const re = /<a\s[^>]*href="(\/news\/[^"]+)"[^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]*?<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    const title = stripTags(m[2]).trim();
    if (title) {
      items.push({
        title,
        url: `https://www.anthropic.com${url}`,
      });
    }
  }
  return items;
}

/**
 * anthropic.com/engineering
 * Pattern: <h3>Title</h3> — skip lines starting with "Image N:"
 */
function parseEng(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const title = stripTags(m[1]).trim();
    if (title && !isImageCaption(title)) {
      items.push({ title });
    }
  }
  return items;
}

/**
 * anthropic.com/learn
 * Pattern: <h3>Title</h3> for course/resource names
 */
function parseLearn(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const title = stripTags(m[1]).trim();
    if (title) {
      items.push({ title });
    }
  }
  return items;
}

/**
 * alignment.anthropic.com
 * Pattern: <h4>Title</h4> for blog post titles
 */
function parseAlignment(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const re = /<h4[^>]*>([\s\S]*?)<\/h4>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const title = stripTags(m[1]).trim();
    if (title) {
      items.push({ title });
    }
  }
  return items;
}

/**
 * docs.anthropic.com/en/release-notes/overview
 * Pattern: <h3>Date string</h3> like "January 12, 2026"
 * The date is both the title and the date field.
 */
function parseReleases(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = stripTags(m[1]).trim();
    // Validate it looks like a date: "Month DD, YYYY" or similar
    if (raw && isDateLike(raw)) {
      items.push({ title: raw, date: raw });
    }
  }
  return items;
}

/**
 * claude.com/resources/courses
 * Courses appear as plain text in <div class="course-item"> or similar containers.
 * Also try extracting from <h3>, <h4>, <li>, or <div class="course-item"> patterns.
 */
function parseCourses(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];

  // Strategy 1: <div class="course-item">Title</div> or similar container
  const divRe = /<div[^>]*class="[^"]*course[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = divRe.exec(html)) !== null) {
    const title = stripTags(m[1]).trim();
    if (title && title.length > 3 && title.length < 200) {
      items.push({ title });
    }
  }

  // Strategy 2: If no items from divs, try <h3>/<h4> tags
  if (items.length === 0) {
    const hRe = /<h[34][^>]*>([\s\S]*?)<\/h[34]>/gi;
    while ((m = hRe.exec(html)) !== null) {
      const title = stripTags(m[1]).trim();
      if (title && title.length > 3 && title.length < 200) {
        items.push({ title });
      }
    }
  }

  // Strategy 3: If still nothing, try <li> items
  if (items.length === 0) {
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    while ((m = liRe.exec(html)) !== null) {
      const title = stripTags(m[1]).trim();
      if (title && title.length > 3 && title.length < 200) {
        items.push({ title });
      }
    }
  }

  return items;
}

/**
 * anthropic.com/events
 * Pattern: <h3>Event Name</h3> — filter out noise like "We don't have any events..."
 */
function parseEvents(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const title = stripTags(m[1]).trim();
    if (title && !isEventsNoise(title)) {
      items.push({ title });
    }
  }
  return items;
}

// ── Utility functions ──

/** Strip HTML tags from a string */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** Check if text looks like "Image N: ..." caption */
function isImageCaption(text: string): boolean {
  return /^Image\s+\d+\s*:/i.test(text);
}

/** Check if text looks like a date: "Month DD, YYYY" */
function isDateLike(text: string): boolean {
  return /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/i.test(
    text
  );
}

/** Filter noise from events page */
function isEventsNoise(text: string): boolean {
  const noise = [
    "don't have any events",
    "no events matching",
    "check back later",
    "subscribe to",
  ];
  const lower = text.toLowerCase();
  return noise.some((n) => lower.includes(n));
}

/** Deduplicate items by title (case-insensitive). First occurrence wins. */
function dedup(items: ParsedItem[]): ParsedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
