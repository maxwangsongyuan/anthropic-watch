import { describe, it, expect } from "vitest";
import { buildLarkCard } from "../src/notifier";
import type { NewItemWithSummary } from "../src/types";

describe("buildLarkCard", () => {
  it("builds card with items grouped by source", () => {
    const items: NewItemWithSummary[] = [
      {
        sourceKey: "eng",
        sourceName: "Engineering Blog",
        title: "Building agents",
        url: "https://anthropic.com/engineering/agents",
        summary: {
          text: "A guide to building agents.",
          keywordsMatched: ["agents"],
          relevanceScore: 8,
        },
      },
      {
        sourceKey: "pdfs",
        sourceName: "New PDFs",
        title: "Skills Guide",
        url: "https://resources.anthropic.com/hubfs/guide.pdf",
        summary: {
          text: "Guide to building skills.",
          keywordsMatched: ["skills"],
          relevanceScore: 9,
        },
      },
    ];

    const card = buildLarkCard(items);
    expect(card.msg_type).toBe("interactive");
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain("Building agents");
    expect(cardStr).toContain("Skills Guide");
    expect(cardStr).toContain("agents");
    expect(cardStr).toContain("8/10");
    expect(cardStr).toContain("9/10");
  });

  it("handles items without summary", () => {
    const items: NewItemWithSummary[] = [
      {
        sourceKey: "news",
        sourceName: "News",
        title: "New product launch",
      },
    ];

    const card = buildLarkCard(items);
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain("New product launch");
    expect(card.card.header.title.content).toContain("1 new item");
  });

  it("groups multiple items from same source", () => {
    const items: NewItemWithSummary[] = [
      { sourceKey: "eng", sourceName: "Engineering Blog", title: "Article 1" },
      { sourceKey: "eng", sourceName: "Engineering Blog", title: "Article 2" },
      { sourceKey: "news", sourceName: "News", title: "News 1" },
    ];

    const card = buildLarkCard(items);
    const cardStr = JSON.stringify(card);
    expect(cardStr).toContain("Engineering Blog");
    expect(cardStr).toContain("News");
    expect(card.card.header.title.content).toContain("3 new items");
  });
});
