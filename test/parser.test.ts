import { describe, it, expect } from "vitest";
import { parseSource } from "../src/parser";

// ── Realistic HTML snippets based on actual page structure ──

const NEWS_HTML = `
<div class="post-listing">
  <a href="/news/claude-sonnet-4-6">
    <span>Product</span>
    <h4>Introducing Claude Sonnet 4.6</h4>
  </a>
  <a href="/news/claude-code-security">
    <span>Announcements</span>
    <h4>Making frontier cybersecurity capabilities available to defenders</h4>
  </a>
  <a href="/news/claude-agents-tool-use">
    <span>Research</span>
    <h4>Agent tool use and evaluation methods</h4>
  </a>
</div>
`;

const ENG_HTML = `
<div class="blog-listing">
  <div class="post-card">
    <h3>Building a C compiler with a team of parallel Claudes</h3>
  </div>
  <div class="post-card">
    <h3>Designing AI-resistant technical evaluations</h3>
  </div>
  <div class="post-card">
    <h3>Demystifying evals for AI agents</h3>
  </div>
  <div class="post-card">
    <h3>Image 1: Architecture diagram</h3>
  </div>
</div>
`;

const LEARN_HTML = `
<div class="learning-hub">
  <div class="featured">
    <h3>Claude Code in Action</h3>
  </div>
  <div class="course-card">
    <h3>Prompt engineering best practices</h3>
  </div>
  <div class="course-card">
    <h3>Building with the Claude API</h3>
  </div>
  <div class="course-card">
    <h3>Understanding context windows</h3>
  </div>
</div>
`;

const ALIGNMENT_HTML = `
<div class="blog-posts">
  <article>
    <h4>Constitutional AI: Harmlessness from AI Feedback</h4>
    <p>We describe a method for training...</p>
  </article>
  <article>
    <h4>Scaling Monosemanticity: Extracting Interpretable Features from Claude 3 Sonnet</h4>
    <p>We report the successful application...</p>
  </article>
  <article>
    <h4>Mapping the Mind of a Large Language Model</h4>
    <p>Recently we released a paper...</p>
  </article>
</div>
`;

const RELEASES_HTML = `
<div class="release-notes">
  <section>
    <h3>January 12, 2026</h3>
    <p>Added new streaming capabilities for the Messages API with improved latency.</p>
  </section>
  <section>
    <h3>December 20, 2025</h3>
    <p>Introduced Claude 3.5 Haiku model with cost-optimized performance.</p>
  </section>
  <section>
    <h3>November 5, 2025</h3>
    <p>New batch processing endpoint for high-volume API usage.</p>
  </section>
</div>
`;

const COURSES_HTML = `
<div class="courses-list">
  <div class="course-item">Introduction to agent skills</div>
  <div class="course-item">AI Fluency: Framework & Foundations</div>
  <div class="course-item">Building with the Claude API</div>
  <div class="course-item">Claude Code in Action</div>
  <div class="course-item">Introduction to Model Context Protocol</div>
  <div class="course-item">Claude 101</div>
</div>
`;

const EVENTS_HTML = `
<div class="events-listing">
  <div class="event-card">
    <h3>AI Safety Summit 2026</h3>
    <p>March 15, 2026 — San Francisco</p>
  </div>
  <div class="event-card">
    <h3>Building Reliable AI Agents Workshop</h3>
    <p>April 2, 2026 — Virtual</p>
  </div>
  <div class="noise">We don't have any events matching those criteria yet</div>
  <div class="event-card">
    <h3>Enterprise AI Deployment Conference</h3>
    <p>May 10, 2026 — New York</p>
  </div>
</div>
`;

// ── Tests ──

describe("parseSource", () => {
  // ── news ──
  describe("news", () => {
    it("extracts titles and links from anchor/h4 patterns", () => {
      const items = parseSource("news", NEWS_HTML);
      expect(items.length).toBe(3);
      expect(items[0].title).toBe("Introducing Claude Sonnet 4.6");
      expect(items[0].url).toBe("https://www.anthropic.com/news/claude-sonnet-4-6");
      expect(items[1].title).toBe(
        "Making frontier cybersecurity capabilities available to defenders"
      );
      expect(items[1].url).toBe("https://www.anthropic.com/news/claude-code-security");
      expect(items[2].title).toBe("Agent tool use and evaluation methods");
    });

    it("deduplicates titles case-insensitively", () => {
      const html = `
        <a href="/news/slug-a"><h4>Same Title</h4></a>
        <a href="/news/slug-b"><h4>same title</h4></a>
      `;
      const items = parseSource("news", html);
      expect(items.length).toBe(1);
    });
  });

  // ── eng ──
  describe("eng", () => {
    it("extracts article titles from h3 tags", () => {
      const items = parseSource("eng", ENG_HTML);
      expect(items.some((i) => i.title.includes("C compiler"))).toBe(true);
      expect(items.some((i) => i.title.includes("AI-resistant"))).toBe(true);
      expect(items.some((i) => i.title.includes("evals for AI agents"))).toBe(true);
    });

    it("skips 'Image N:' lines", () => {
      const items = parseSource("eng", ENG_HTML);
      expect(items.every((i) => !i.title.startsWith("Image "))).toBe(true);
    });
  });

  // ── learn ──
  describe("learn", () => {
    it("extracts course and resource names", () => {
      const items = parseSource("learn", LEARN_HTML);
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items.some((i) => i.title === "Claude Code in Action")).toBe(true);
      expect(items.some((i) => i.title === "Building with the Claude API")).toBe(true);
    });
  });

  // ── alignment ──
  describe("alignment", () => {
    it("extracts blog post titles from h4 tags", () => {
      const items = parseSource("alignment", ALIGNMENT_HTML);
      expect(items.length).toBe(3);
      expect(items.some((i) => i.title.includes("Constitutional AI"))).toBe(true);
      expect(items.some((i) => i.title.includes("Monosemanticity"))).toBe(true);
      expect(items.some((i) => i.title.includes("Mind of a Large Language Model"))).toBe(
        true
      );
    });
  });

  // ── releases ──
  describe("releases", () => {
    it("extracts date entries as titles", () => {
      const items = parseSource("releases", RELEASES_HTML);
      expect(items.length).toBe(3);
      expect(items[0].title).toBe("January 12, 2026");
      expect(items[0].date).toBe("January 12, 2026");
      expect(items[1].title).toBe("December 20, 2025");
      expect(items[2].title).toBe("November 5, 2025");
    });
  });

  // ── courses ──
  describe("courses", () => {
    it("extracts course name list", () => {
      const items = parseSource("courses", COURSES_HTML);
      expect(items.length).toBeGreaterThanOrEqual(5);
      expect(items.some((i) => i.title === "Introduction to agent skills")).toBe(true);
      expect(items.some((i) => i.title === "Claude Code in Action")).toBe(true);
      expect(items.some((i) => i.title === "Introduction to Model Context Protocol")).toBe(
        true
      );
    });
  });

  // ── events ──
  describe("events", () => {
    it("extracts event names from h3 tags", () => {
      const items = parseSource("events", EVENTS_HTML);
      expect(items.some((i) => i.title === "AI Safety Summit 2026")).toBe(true);
      expect(items.some((i) => i.title === "Building Reliable AI Agents Workshop")).toBe(
        true
      );
      expect(items.some((i) => i.title === "Enterprise AI Deployment Conference")).toBe(
        true
      );
    });

    it("filters out noise text", () => {
      const items = parseSource("events", EVENTS_HTML);
      expect(
        items.every((i) => !i.title.includes("don't have any events"))
      ).toBe(true);
    });
  });

  // ── edge cases ──
  describe("edge cases", () => {
    it("returns empty array for empty HTML", () => {
      expect(parseSource("news", "")).toEqual([]);
      expect(parseSource("eng", "")).toEqual([]);
      expect(parseSource("releases", "")).toEqual([]);
    });

    it("returns empty array for unknown source key", () => {
      expect(parseSource("unknown-key", "<h1>Hello</h1>")).toEqual([]);
    });

    it("returns empty array for HTML with no matching patterns", () => {
      const noMatchHtml = "<div><p>Just some random paragraph.</p></div>";
      expect(parseSource("news", noMatchHtml)).toEqual([]);
      expect(parseSource("eng", noMatchHtml)).toEqual([]);
    });

    it("trims whitespace from extracted titles", () => {
      const html = `<a href="/news/test"><h4>  Spaced Title  </h4></a>`;
      const items = parseSource("news", html);
      expect(items[0].title).toBe("Spaced Title");
    });
  });
});
