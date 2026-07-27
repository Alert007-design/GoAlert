import { harvestFeeds, type FeedEntry } from "./feeds";
import type { FoundItem } from "./feeds";

export type { FoundItem };

/**
 * Hvor langt tilbage et fund må være for at tælle med i en alarm.
 * Kan justeres med miljøvariablen SCAN_MAX_AGE_HOURS uden kodeændring.
 */
const MAX_AGE_HOURS = Number(process.env.SCAN_MAX_AGE_HOURS || 24);
const MAX_AGE_MS = MAX_AGE_HOURS * 60 * 60 * 1000;

export function cutoffDate(): Date {
  return new Date(Date.now() - MAX_AGE_MS);
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DANISH_SOURCE_NAMES = [
  "dr", "dr nyheder", "politiken", "jyllands-posten", "jyllandsposten", "jp",
  "berlingske", "ekstra bladet", "ekstrabladet", "b.t.", "bt", "information",
  "kristeligt dagblad", "weekendavisen", "altinget", "finans", "børsen",
  "boersen", "nordjyske", "jydskevestkysten", "fyens stiftstidende",
  "se og hør", "seoghør", "seoghoer", "billed-bladet", "billedbladet",
  "femina", "alt for damerne",
];

/**
 * Bevares, fordi /api/debug/news stadig bruger den. Med feed-baserede kilder
 * er den ikke længere nødvendig i selve scanningen — vi henter kun fra
 * danske medier, så alt der kommer ind er dansk per definition.
 */
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

function entryToItem(entry: FeedEntry): FoundItem {
  return {
    title: entry.title,
    url: entry.url,
    source: entry.source,
    publishedAt: entry.published.toISOString(),
  };
}

export async function fetchNews(keyword: string): Promise<FoundItem[]> {
  const cutoff = cutoffDate();
  const needle = keyword.toLowerCase().trim();
  if (!needle) return [];

  const { entries, status } = await harvestFeeds();

  const døde = status.filter((s) => !s.ok).map((s) => s.name);
  if (døde.length === status.length) {
    // Alle kilder nede er en reel fejl, ikke bare "ingen nyheder".
    throw new Error(`Ingen af de ${status.length} nyhedskilder svarede`);
  }

  const friske = entries.filter((e) => e.published >= cutoff);
  const træffere = friske.filter((e) => e.haystack.includes(needle));

  // Samme historie kan ligge i flere DR-feeds (fx både "senestenyt" og
  // "politik"), så vi folder på URL.
  const setUrls = new Set<string>();
  const items: FoundItem[] = [];
  for (const e of træffere) {
    if (setUrls.has(e.url)) continue;
    setUrls.add(e.url);
    items.push(entryToItem(e));
  }

  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  console.log(
    `[nyheder] "${keyword}": ${entries.length} indlæg fra feeds → ` +
      `${friske.length} inden for ${MAX_AGE_HOURS}t → ${items.length} med søgeordet` +
      (døde.length ? ` (kilder uden svar: ${døde.join(", ")})` : "")
  );

  return items.slice(0, 25);
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
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    redditTokenCache = null;
    throw new Error(`Reddit token-fejl ${tokenRes.status}: ${text}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string | undefined;
  const expiresIn = Number(tokenData.expires_in || 3600);

  if (!accessToken) {
    throw new Error("Reddit returnerede ikke et access_token");
  }

  redditTokenCache = { token: accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

export async function fetchReddit(keyword: string): Promise<FoundItem[]> {
  const cutoff = cutoffDate();
  const token = await getRedditAccessToken();
  const userAgent =
    process.env.REDDIT_USER_AGENT || "server:gossip-alert:v1.0 (by /u/yourusername)";

  const url =
    `https://oauth.reddit.com/search` +
    `?q=${encodeURIComponent(keyword)}` +
    `&sort=new&t=day&limit=25&type=link`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reddit svarede med status ${res.status}: ${text}`);
  }

  const data = await res.json();
  const children = data?.data?.children || [];

  const items: FoundItem[] = children
    .map((c: any) => c?.data)
    .filter(Boolean)
    .filter((item: any) => item.permalink && (item.title || item.selftext))
    .map((item: any) => {
      // created_utc er sekunder siden epoch, ikke millisekunder.
      const seconds = Number(item.created_utc);
      const published = Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
      return {
        title: (item.title || item.selftext || "(uden titel)").trim(),
        url: `https://www.reddit.com${item.permalink}`,
        source: `Reddit (r/${item.subreddit})`,
        publishedAt: published ? published.toISOString() : "",
      };
    })
    .filter((item: FoundItem) => {
      if (!item.publishedAt) return false;
      return new Date(item.publishedAt) >= cutoff;
    });

  console.log(
    `[reddit] "${keyword}": ${children.length} i svar → ${items.length} inden for ${MAX_AGE_HOURS}t`
  );

  return items;
}

/**
 * Timer luft på OData-filteret. Folketingets datoer er angivet i dansk lokaltid
 * uden tidszone, mens serveren kører i UTC.
 */
const FT_GRACE_MS = 3 * 60 * 60 * 1000;

export async function fetchFolketinget(keyword: string): Promise<FoundItem[]> {
  const escapedKeyword = keyword.replace(/'/g, "''");

  // Dokument frem for Sag: Sag har kun "opdateringsdato", som ændrer sig hver
  // gang Folketinget rører en gammel række. Dokument har en rigtig "dato".
  const cutoff = new Date(cutoffDate().getTime() - FT_GRACE_MS);
  const cutoffLiteral = cutoff.toISOString().slice(0, 19);

  const filter =
    `substringof('${escapedKeyword}',titel) and dato gt datetime'${cutoffLiteral}'`;
  const url =
    `https://oda.ft.dk/api/Dokument?$format=json&$top=20&$orderby=dato desc` +
    `&$filter=${encodeURIComponent(filter)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Folketingets åbne data svarede med status ${res.status}`);
  }

  const data = await res.json();
  const rows: any[] = data.value || [];

  const items: FoundItem[] = rows
    .filter((doc) => doc.titel && doc.dato)
    .map((doc) => {
      const published = new Date(doc.dato);
      return {
        title: String(doc.titel),
        url: `https://www.ft.dk/da/search?as=1&q=${encodeURIComponent(String(doc.titel))}`,
        source: "Folketinget (åbne data)",
        publishedAt: Number.isNaN(published.getTime()) ? "" : published.toISOString(),
      };
    })
    .filter((item) => item.publishedAt !== "");

  console.log(
    `[folketinget] "${keyword}": ${rows.length} dokumenter siden ${cutoffLiteral} → ${items.length} brugbare`
  );

  return items;
}

export type TopStory = FoundItem;

const GOSSIP_WORDS = [
  "kendis", "reality", "royale", "kongehus", "kronprins", "dronning",
  "skilsmisse", "forlovet", "stjerne", "sangerinde", "skuespiller",
];
const GOSSIP_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export async function fetchTopDanishStories(maxCount = 3): Promise<TopStory[]> {
  let harvest;
  try {
    harvest = await harvestFeeds();
  } catch (err) {
    console.error("Kunne ikke hente feeds til forsiden:", err);
    return [];
  }

  const cutoff = new Date(Date.now() - GOSSIP_MAX_AGE_MS);
  const kandidater = harvest.entries
    .filter((e) => e.published >= cutoff)
    .filter((e) => GOSSIP_WORDS.some((w) => e.haystack.includes(w)))
    .sort((a, b) => b.published.getTime() - a.published.getTime());

  const seenUrls = new Set<string>();
  const seenSources = new Set<string>();
  const stories: TopStory[] = [];

  for (const entry of kandidater) {
    if (stories.length >= maxCount) break;
    if (seenUrls.has(entry.url)) continue;
    if (seenSources.has(entry.source)) continue;
    seenUrls.add(entry.url);
    seenSources.add(entry.source);
    stories.push(entryToItem(entry));
  }

  console.log(`[forside] ${kandidater.length} kandidater → ${stories.length} historier`);

  return stories;
}
