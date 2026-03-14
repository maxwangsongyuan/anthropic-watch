import type { NewItemWithSummary } from "./types";

async function signLark(
  secret: string
): Promise<{ timestamp: string; sign: string }> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const stringToSign = `${timestamp}\n${secret}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(stringToSign),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new Uint8Array(0));
  const sign = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return { timestamp, sign };
}

interface LarkCard {
  msg_type: "interactive";
  card: {
    config: { wide_screen_mode: boolean };
    header: { title: { tag: string; content: string }; template: string };
    elements: Array<{ tag: string; content?: string }>;
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
      tag: "markdown",
      content: `**━━━ ${sourceName} ━━━**`,
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
      elements.push({ tag: "markdown", content });
    }

    elements.push({ tag: "hr" });
  }

  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
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
  webhookSecret: string,
  items: NewItemWithSummary[]
): Promise<void> {
  if (items.length === 0) return;

  const card = buildLarkCard(items);
  const larkSign = await signLark(webhookSecret);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...card, ...larkSign }),
  });

  if (!response.ok) {
    throw new Error(`Lark webhook failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { code?: number; msg?: string };
  if (body.code !== undefined && body.code !== 0) {
    throw new Error(`Lark webhook error: code=${body.code} msg=${body.msg}`);
  }
}
