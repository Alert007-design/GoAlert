export type FoundItem = {
  title: string;
  url: string;
  source: string;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

export async function fetchNews(keyword: string): Promise<FoundItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    keyword
  )}&hl=da&gl=DK&ceid=DK:da`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const xml = await res.text();

    const items: FoundItem[] = [];
    const itemBlocks = xml.split("<item>").slice(1);

    for (const block of itemBlocks.slice(0, 10)) {
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

      if (titleMatch && linkMatch) {
        items.push({
          title: decodeEntities(titleMatch[1]),
          url: decodeEntities(linkMatch[1]),
          source: sourceMatch ? decodeEntities(sourceMatch[1]) : "Google News",
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

export async function fetchReddit(keyword: string): Promise<FoundItem[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
    keyword
  )}&sort=new&limit=10`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "gossip-alert-bot/1.0" },
    });
    if (!res.ok) return [];
    const data = await res.json();

    const items: FoundItem[] = (data.data?.children || []).map((c: any) => ({
      title: c.data.title,
      url: `https://www.reddit.com${c.data.permalink}`,
      source: `Reddit (r/${c.data.subreddit})`,
    }));
    return items;
  } catch {
    return [];
  }
}
