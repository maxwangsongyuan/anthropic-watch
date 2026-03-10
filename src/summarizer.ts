import type { Env, Summary } from "./types";

export function extractKeywordMatches(
  text: string,
  keywords: string[]
): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

export function buildSummaryPrompt(
  articleText: string,
  keywords: string[]
): string {
  const truncated = articleText.slice(0, 2000);
  return `Summarize this article in 2-3 concise sentences. Focus on practical takeaways.
Then rate its relevance (0-10) to these interests: ${keywords.join(", ")}.

Article:
${truncated}

Respond in this exact JSON format:
{"summary": "...", "relevance": N}`;
}

export async function summarizeArticle(
  env: Env,
  articleText: string
): Promise<Summary> {
  const keywords = env.INTEREST_KEYWORDS.split(",").map((k) => k.trim());
  const keywordsMatched = extractKeywordMatches(articleText, keywords);

  try {
    const prompt = buildSummaryPrompt(articleText, keywords);
    const response = (await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
      }
    )) as { response?: string };

    const text = response.response ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        summary: string;
        relevance: number;
      };
      return {
        text: parsed.summary,
        keywordsMatched,
        relevanceScore: Math.min(10, Math.max(0, parsed.relevance)),
      };
    }

    return {
      text: text.slice(0, 300),
      keywordsMatched,
      relevanceScore: keywordsMatched.length > 0 ? 5 : 2,
    };
  } catch (error) {
    console.error("AI summarization failed:", error);
    return {
      text: "",
      keywordsMatched,
      relevanceScore: keywordsMatched.length > 0 ? 5 : 2,
    };
  }
}

export async function saveSummary(
  db: D1Database,
  contentItemId: number,
  summary: Summary
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO summaries (content_item_id, summary, keywords_matched, relevance_score) VALUES (?, ?, ?, ?)"
    )
    .bind(
      contentItemId,
      summary.text,
      JSON.stringify(summary.keywordsMatched),
      summary.relevanceScore
    )
    .run();
}
