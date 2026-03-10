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

  it("is case-insensitive", () => {
    const text = "Using AGENTS with mcp servers";
    const keywords = ["agents", "MCP"];
    const matches = extractKeywordMatches(text, keywords);
    expect(matches).toContain("agents");
    expect(matches).toContain("MCP");
  });

  it("returns empty for no matches", () => {
    const text = "Company financial results for Q4";
    const keywords = ["agents", "skills", "MCP"];
    expect(extractKeywordMatches(text, keywords)).toEqual([]);
  });
});

describe("buildSummaryPrompt", () => {
  it("includes article text and keywords", () => {
    const prompt = buildSummaryPrompt("Article about MCP servers", ["agents", "MCP"]);
    expect(prompt).toContain("Article about MCP servers");
    expect(prompt).toContain("agents");
    expect(prompt).toContain("MCP");
  });

  it("truncates long text", () => {
    const longText = "x".repeat(5000);
    const prompt = buildSummaryPrompt(longText, ["agents"]);
    expect(prompt.length).toBeLessThan(5000);
  });
});
