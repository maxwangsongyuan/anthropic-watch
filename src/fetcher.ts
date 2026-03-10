import type { Env, ParsedItem } from "./types";

export async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "anthropic-watch/1.0 (content monitor)",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
}

export async function fetchGoogleCSE(env: Env): Promise<ParsedItem[]> {
  if (!env.GOOGLE_CSE_API_KEY || !env.GOOGLE_CSE_CX) {
    console.log("Google CSE not configured, skipping PDF check");
    return [];
  }
  const query = encodeURIComponent("site:resources.anthropic.com/hubfs filetype:pdf");
  const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_CSE_API_KEY}&cx=${env.GOOGLE_CSE_CX}&q=${query}&num=10`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google CSE HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    items?: Array<{ title: string; link: string }>;
  };

  return (data.items ?? []).map((item) => ({
    title: item.title,
    url: item.link,
  }));
}
