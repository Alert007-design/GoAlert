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
    .replace(/&nbsp;/g, " ")
    .replace(/<!\\[CDATA\\[/g, "")     .replace(/\\]\]>/g, "")
    .trim();
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DANISH_DOMAINS = [
  "dr.dk",
  "tv2.dk",
  "politiken.dk",
  "jyllands-posten.dk",
  "berlingske.dk",
  "eb.dk",
  "bt.dk",
  "information.dk",
  "kristeligt-dagblad.dk",
  "weekendavisen.dk",
  "altinget.dk",
  "finans.dk",
  "borsen.dk",
  "nordjyske.dk",
  "jv.dk",
  "fyens.dk",
  "seoghoer.dk",
  "billedbladet.dk",
  "femina.dk",
  "alt.dk",
];

const SITE_CLAUSE = "(" + DANISH_DOMAINS.map((d) => `site:${d}`).join(" OR ") + ")";

const DANISH_SOURCE_NAMES = [
  "dr", "dr nyheder", "politiken", "jyllands-posten", "jyllandsposten", "jp",
  "berlingske", "ekstra bladet", "ekstrabladet", "b.t.", "bt", "information",
  "kristeligt dagblad", "weekendavisen", "altinget", "finans", "børsen",
  "boersen", "nordjyske", "jydskevestkysten", "fyens stiftstidende",
  "se og hør", "seoghør", "seoghoer", "billed-bladet", "billedbladet",
  "femina", "alt for damerne",
];

export function isDanishSource(sourceName: string): boolean {
  const normalized = sourceName.toLowerCase().trim();
  if (!normalized) return false;
  if (/\.dk$/i.test(normalized)) return true;
  return DANISH_SOURCE_NAMES.some((known) => {
    if (normalized === known) return true;
    const wordBoundaryMatch = new RegExp(`(^|\\s)${escapeRegex(known)}(\\s|$)`, "i");
    return wordBoundaryMatch.test(normalized);
  });
}

function parseGoogleNewsRss(xml: string, maxItems: number): FoundItem[] {
  const items: FoundItem[] = [];
  const itemBlocks = xml.split("<item>").slice(1);
  for (const block of itemBlocks.slice(0, maxItems)) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    if (titleMatch && linkMatch) {
      const sourceName = sourceMatch ? decodeEntities(sourceMatch[1]) : "Google News";
      if (!isDanishSource(sourceName)) continue;
      items.push({
        title: decodeEntities(titleMatch[1]),
        url: decodeEntities(linkMatch[1]),
        source: sourceName,
      });
    }
  }
  return items;
}

export async function fetchNews(keyword: string): Promise<FoundItem[]> {
  const query = `${keyword} ${SITE_CLAUSE}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=da&gl=DK&ceid=DK:da`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Google News RSS svarede med status ${res.status}`);
  }

  const xml = await res.text();
  return parseGoogleNewsRss(xml, 10);
}

let redditTokenCache: { token: string; expiresAt: number } | null = null;

async function getRedditAccessToken(): Promise<string> {
  const now = Date.now();
  if (redditTokenCache && redditTokenCache.expiresAt > now + 60_000) {
    return redditTokenCache.token;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent =
    process.env.REDDIT_USER_AGENT || "server:gossip-alert:v1.0 (by /u/yourusername)";

  if (!clientId || !clientSecret) {
    throw new Error("Mangler REDDIT_CLIENT_ID eller REDDIT_CLIENT_SECRET");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Reddit token-fejl ${tokenRes.status}: ${text}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string | undefined;
  const expiresIn = Number(tokenData.expires_in || 3600);

  if (!accessToken) {
    throw new Error("Reddit returnerede ikke et access_token");
  }

  redditTokenCache = {
    token: accessToken,
    expiresAt: now + expiresIn * 1000,
  };

  return accessToken;
}

export async function fetchReddit(keyword: string): Promise<FoundItem[]> {
  const token = await getRedditAccessToken();
  const userAgent =
    process.env.REDDIT_USER_AGENT || "server:gossip-alert:v1.0 (by /u/yourusername)";

  const url =
    `https://oauth.reddit.com/search` +
    `?q=${encodeURIComponent(keyword)}` +
    `&sort=new` +
    `&limit=10` +
    `&type=link`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reddit svarede med status ${res.status}: ${text}`);
  }

  const data = await res.json();
  const children = data?.data?.children || [];

  return children
    .map((c: any) => c?.data)
    .filter(Boolean)
    .filter((item: any) => item.permalink && (item.title || item.selftext))
    .map((item: any) => ({
      title: (item.title || item.selftext || "(uden titel)").trim(),
      url: `https://www.reddit.com${item.permalink}`,
      source: `Reddit (r/${item.subreddit})`,
    }));
}

export async function fetchFolketinget(keyword: string): Promise<FoundItem[]> {
  const escapedKeyword = keyword.replace(/'/g, "''");
  const filter = `substringof('${escapedKeyword}',titel)`;
  const url =
    `https://oda.ft.dk/api/Sag?$format=json&$top=10&$orderby=opdateringsdato desc` +
    `&$filter=${encodeURIComponent(filter)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Folketingets åbne data svarede med status ${res.status}`);
  }

  const data = await res.json();
  const rows: any[] = data.value || [];

  return rows
    .filter((sag) => sag.titel)
    .map((sag) => ({
      title: sag.titel as string,
      url: `https://www.ft.dk/da/search?as=1&q=${encodeURIComponent(sag.titel)}`,
      source: "Folketinget (åbne data)",
    }));
}

export type TopStory = FoundItem;

const GOSSIP_DOMAINS = ["seoghoer.dk", "billedbladet.dk", "eb.dk", "bt.dk"];
const GOSSIP_TOPIC_WORDS = ["kendis", "reality", "underholdning", "royale"];

async function fetchGossipFeed(): Promise<FoundItem[]> {
  const topicClause = "(" + GOSSIP_TOPIC_WORDS.join(" OR ") + ")";
  const domainClause = "(" + GOSSIP_DOMAINS.map((d) => `site:${d}`).join(" OR ") + ")";
  const query = `${topicClause} when:2d ${domainClause}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=da&gl=DK&ceid=DK:da`;

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) {
    throw new Error(`Google News RSS svarede med status ${res.status}`);
  }

  const xml = await res.text();
  return parseGoogleNewsRss(xml, 20);
}

function stripSourceSuffix(title: string, source: string): string {
  const re = new RegExp(`\\s*-\\s*${escapeRegex(source)}$`, "i");
  return title.replace(re, "").trim();
}

export async function fetchTopDanishStories(maxCount = 3): Promise<TopStory[]> {
  let items: FoundItem[] = [];
  try {
    items = await fetchGossipFeed();
  } catch (err) {
    console.error("Kunne ikke hente sladder-feed til forsiden:", err);
    return [];
  }

  const seenUrls = new Set<string>();
  const seenSources = new Set<string>();
  const stories: TopStory[] = [];

  for (const item of items) {
    if (stories.length >= maxCount) break;
    if (seenUrls.has(item.url)) continue;
    if (seenSources.has(item.source)) continue;
    seenUrls.add(item.url);
    seenSources.add(item.source);
    stories.push({ ...item, title: stripSourceSuffix(item.title, item.source) });
  }

  return stories;
}
