import type { SourceConfig } from "./types";

export const SOURCES: SourceConfig[] = [
  { key: "news", url: "https://www.anthropic.com/news", name: "Anthropic News", type: "html" },
  { key: "eng", url: "https://www.anthropic.com/engineering", name: "Engineering Blog", type: "html" },
  { key: "learn", url: "https://www.anthropic.com/learn", name: "Learning Resources", type: "html" },
  { key: "alignment", url: "https://alignment.anthropic.com", name: "Alignment Blog", type: "html" },
  { key: "releases", url: "https://docs.anthropic.com/en/release-notes/overview", name: "API Release Notes", type: "html" },
  { key: "courses", url: "https://claude.com/resources/courses", name: "Anthropic Courses", type: "html" },
  { key: "events", url: "https://www.anthropic.com/events", name: "Events & Webinars", type: "html" },
  { key: "pdfs", url: "", name: "New PDFs & Guides", type: "google-cse" },
];
