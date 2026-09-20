// Kilderne.
//
// VIGTIGT om ansvarsfordelingen: filerne her INDSAMLER kun. De må ikke selv
// afgøre, om et fund er for gammelt. Den beslutning træffes ét sted, i
// freshness.ts, efter at alt er samlet. Tidligere havde hver kilde sin egen
// aldersgrænse, og Folketinget havde fået tre timers ekstra luft — så kunne
// et fund på 27 timer havne i en mail, der lover indhold fra det seneste døgn.
//
// Kilder må gerne bruge vinduet som et HINT, når de spørger et API (fx for
// ikke at hente tusindvis af gamle rækker). De må bare ikke stole på det som
// den endelige filtrering.

import { harvestFeeds, type FeedEntry } from "./feeds";
import type { RawItem } from "./freshness";
import { matchesKeyword } from "./matching";

export type { FoundItem } from "./feeds";
export type { RawItem };

/** Hvor mange fund én kilde højst må bidrage med pr. søgeord. */
const MAX_PR_KILDE = 50;

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
 * Bevares, fordi /api/debug/news stadig bruger den, og fordi den bliver
 * central igen i fase 3, hvor GDELT kan levere udenlandske kilder.
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

function entryToRaw(entry: FeedEntry): RawItem {
  return {
    title: entry.title,
    url: entry.url,
    source: entry.source,
    platform: entry.platform,
    publishedAt: entry.publishedRaw,
    excerpt: entry.summary || undefined,
  };
}

export type KildeResultat = {
  items: RawItem[];
  /** Navne på kilder der ikke svarede. Vises for kunden i mailen. */
  døde: string[];
};

/**
 * Danske mediers RSS-feeds.
 *
 * Feedene hentes én gang pr. kørsel (harvestFeeds cacher), og der filtreres
 * derefter lokalt på søgeordet. Der filtreres IKKE på alder her.
 */
export async function fetchNews(keyword: string): Promise<KildeResultat> {
  const { entries, status } = await harvestFeeds();

  const døde = status.filter((s) => !s.ok).map((s) => s.name);
  if (døde.length === status.length) {
    // Alle kilder nede er en reel fejl, ikke bare "ingen nyheder".
    throw new Error(`Ingen af de ${status.length} nyhedskilder svarede`);
  }

  const træffere = entries.filter((e) => matchesKeyword(e.haystack, keyword));

  // Samme artikel kan ligge i flere feeds fra samme medie (fx både DR
  // "senestenyt" og DR "politik"). Den endelige dedup sker i grouping.ts,
  // men her spares der arbejde ved at folde de mest oplagte sammen med det samme.
  const set = new Set<string>();
  const items: RawItem[] = [];
  for (const e of træffere) {
    if (set.has(e.url)) continue;
    set.add(e.url);
    items.push(entryToRaw(e));
  }

  if (items.length > MAX_PR_KILDE) {
    console.warn(
      `[nyheder] "${keyword}": ${items.length} træffere — skåret ned til ${MAX_PR_KILDE}.`
    );
  }

  console.log(
    `[nyheder] "${keyword}": ${entries.length} indlæg fra feeds → ${items.length} med søgeordet` +
      (døde.length ? ` (kilder uden svar: ${døde.join(", ")})` : "")
  );

  return { items: items.slice(0, MAX_PR_KILDE), døde };
}

// ---------------------------------------------------------------------------
// Reddit
// ---------------------------------------------------------------------------

/**
 * Reddit er slået FRA.
 *
 * Nøglerne (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET) har aldrig været sat, så
 * kilden fejlede ved hver eneste kørsel — og fejlen blev vist i mailen som
 * "Reddit kunne ikke tjekkes", hver dag. Det ligner en driftsfejl, selvom
 * årsagen bare er manglende adgang.
 *
 * Koden bliver stående, så kilden kan tændes igen uden at skulle skrives
 * forfra. Sæt REDDIT_ENABLED=true OG begge nøgler for at aktivere den.
 */
export function isRedditEnabled(): boolean {
  return (
    process.env.REDDIT_ENABLED === "true" &&
    Boolean(process.env.REDDIT_CLIENT_ID) &&
    Boolean(process.env.REDDIT_CLIENT_SECRET)
  );
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

export async function fetchReddit(keyword: string): Promise<KildeResultat> {
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

  const items: RawItem[] = children
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
        platform: "reddit",
        publishedAt: published ? published.toISOString() : null,
      };
    });

  console.log(`[reddit] "${keyword}": ${items.length} i svar`);

  return { items: items.slice(0, MAX_PR_KILDE), døde: [] };
}

// ---------------------------------------------------------------------------
// Folketingets åbne data
// ---------------------------------------------------------------------------

/**
 * Ekstra luft på selve OPSLAGET — ikke på aldersreglen.
 *
 * Folketingets datoer er angivet i dansk tid uden tidszone, så et snævert
 * filter direkte på UTC ville kunne tabe dokumenter i kanten. Vi henter derfor
 * lidt for bredt og lader freshness.ts skære til bagefter.
 */
const FT_HENT_GRACE_MS = 6 * 60 * 60 * 1000;

export async function fetchFolketinget(
  keyword: string,
  windowStart: Date
): Promise<KildeResultat> {
  const escapedKeyword = keyword.replace(/'/g, "''");

  // Dokument frem for Sag: Sag har kun "opdateringsdato", som ændrer sig hver
  // gang Folketinget rører en gammel række. Dokument har en rigtig "dato".
  const hentFra = new Date(windowStart.getTime() - FT_HENT_GRACE_MS);
  const cutoffLiteral = hentFra.toISOString().slice(0, 19);

  const filter =
    `substringof('${escapedKeyword}',titel) and dato gt datetime'${cutoffLiteral}'`;
  const url =
    `https://oda.ft.dk/api/Dokument?$format=json&$top=50&$orderby=dato desc` +
    `&$filter=${encodeURIComponent(filter)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Folketingets åbne data svarede med status ${res.status}`);
  }

  const data = await res.json();
  const rows: any[] = data.value || [];

  const items: RawItem[] = rows
    .filter((doc) => doc.titel && doc.dato)
    // Folketingets API søger i hele titlen som delstreng. Vi genkontrollerer
    // med hele ord, så "skat" ikke rammer "skattefri" eller "Skatteudvalget",
    // når kunden har bedt om netop ordet "skat".
    .filter((doc) => matchesKeyword(String(doc.titel).toLowerCase(), keyword))
    .map((doc) => ({
      title: String(doc.titel),
      // Folketinget har ikke en offentlig, stabil adresse pr. dokument, så der
      // linkes til deres egen søgning. Dokumentets id hænges på som parameter:
      // ft.dk ignorerer den, men den gør adressen unik pr. dokument, så to
      // forskellige dokumenter med samme titel ikke forveksles i dedup'en.
      url:
        `https://www.ft.dk/da/search?as=1&q=${encodeURIComponent(String(doc.titel))}` +
        `&dokid=${encodeURIComponent(String(doc.id))}`,
      source: "Folketinget (åbne data)",
      platform: "folketinget",
      publishedAt: String(doc.dato),
    }));

  console.log(
    `[folketinget] "${keyword}": ${rows.length} dokumenter siden ${cutoffLiteral} → ${items.length} med søgeordet`
  );

  return { items: items.slice(0, MAX_PR_KILDE), døde: [] };
}

// ---------------------------------------------------------------------------
// Forsidens "det taler vi om"-historier (ikke en del af scannet)
// ---------------------------------------------------------------------------

export type TopStory = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
};

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
    .filter((e) => e.published !== null && e.published >= cutoff)
    .filter((e) => GOSSIP_WORDS.some((w) => e.haystack.includes(w)))
    .sort((a, b) => (b.published?.getTime() || 0) - (a.published?.getTime() || 0));

  const seenUrls = new Set<string>();
  const seenSources = new Set<string>();
  const stories: TopStory[] = [];

  for (const entry of kandidater) {
    if (stories.length >= maxCount) break;
    if (seenUrls.has(entry.url)) continue;
    if (seenSources.has(entry.source)) continue;
    seenUrls.add(entry.url);
    seenSources.add(entry.source);
    stories.push({
      title: entry.title,
      url: entry.url,
      source: entry.source,
      publishedAt: (entry.published as Date).toISOString(),
    });
  }

  console.log(`[forside] ${kandidater.length} kandidater → ${stories.length} historier`);

  return stories;
}
