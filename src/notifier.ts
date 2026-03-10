import type { NewItemWithSummary } from "./types";

interface LarkCard {
  msg_type: string;
  card: {
    header: { title: { tag: string; content: string }; template: string };
    elements: Array<{ tag: string; text?: { tag: string; content: string } }>;
  };
}

export function buildLarkCard(items: NewItemWithSummary[]): LarkCard {
  const grouped = new Map<string, NewItemWithSummary[]>();
  for (const item of items) {
    const key = item.sourceName;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  const elements: LarkCard["card"]["elements"] = [];

  for (const [sourceName, sourceItems] of grouped) {
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `**━━━ ${sourceName} ━━━**` },
    });

    for (const item of sourceItems) {
      let content = `📄 **${item.title}**`;
      if (item.summary?.text) {
        content += `\n💡 ${item.summary.text}`;
      }
      if (item.summary?.keywordsMatched?.length) {
        content += `\n🎯 Keywords: ${item.summary.keywordsMatched.join(", ")}`;
      }
      if (item.summary?.relevanceScore !== undefined) {
        content += `  ⭐ ${item.summary.relevanceScore}/10`;
      }
      if (item.url) {
        content += `\n🔗 [Open](${item.url})`;
      }
      elements.push({ tag: "div", text: { tag: "lark_md", content } });
    }

    elements.push({ tag: "hr" });
  }

  return {
    msg_type: "interactive",
    card: {
      header: {
        title: {
          tag: "plain_text",
          content: `🔔 Anthropic Watch — ${items.length} new item${items.length > 1 ? "s" : ""}`,
        },
        template: "blue",
      },
      elements,
    },
  };
}

export async function sendLarkNotification(
  webhookUrl: string,
  items: NewItemWithSummary[]
): Promise<void> {
  if (items.length === 0) return;

  const card = buildLarkCard(items);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });

  if (!response.ok) {
    throw new Error(`Lark webhook failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { code?: number; msg?: string };
  if (body.code !== undefined && body.code !== 0) {
    throw new Error(`Lark webhook error: code=${body.code} msg=${body.msg}`);
  }
}
