export type FoundItem = {
  title: string;
  url: string;
  source: string;
  /** ISO 8601. Kildens eget udgivelsestidspunkt — ikke hvornår vi fandt det. */
  publishedAt: string;
};

/**
 * Hvor langt tilbage et fund må være for at tælle med i en alarm.
 * Kan justeres med miljøvariablen SCAN_MAX_AGE_HOURS uden kodeændring.
 */
const MAX_AGE_HOURS = Number(process.env.SCAN_MAX_AGE_HOURS || 24);
const MAX_AGE_MS = MAX_AGE_HOURS * 60 * 60 * 1000;

export function cutoffDate(): Date {
  return new Date(Date.now() - MAX_AGE_MS);
}

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
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

type RssParseResult = {
  items: FoundItem[];
  /** Antal <item> i feedet, før filtrering. */
  total: number;
  /** Frasorteret som ikke-dansk kilde. */
  notDanish: number;
  /** Frasorteret som ældre end cutoff. */
  tooOld: number;
  /** Frasorteret fordi datoen manglede eller ikke kunne læses. */
  noDate: number;
  /** Nyeste udgivelsesdato set i feedet — vores bedste diagnose-signal. */
  newest: Date | null;
};

/**
 * Bemærk: der sættes ikke loft på, hvor mange <item> vi LÆSER — kun på hvor
 * mange vi beholder. Google News' RSS er relevanssorteret, ikke datosorteret,
 * så en frisk artikel kan sagtens ligge langt nede i feedet bag måneder
 * gammelt arkivstof. Læste vi kun de første 25, ville vi tabe den.
 *
 * @param cutoff Sæt til null for ikke at datofiltrere (bruges til forsidens feed).
 */
function parseGoogleNewsRss(
  xml: string,
  maxItems: number,
  cutoff: Date | null
): RssParseResult {
  const items: FoundItem[] = [];
  const itemBlocks = xml.split("<item>").slice(1);
  let notDanish = 0;
  let tooOld = 0;
  let noDate = 0;
  let newest: Date | null = null;

  for (const block of itemBlocks) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titleMatch || !linkMatch) continue;

    const published = dateMatch ? new Date(decodeEntities(dateMatch[1])) : null;
    const hasDate = !!published && !Number.isNaN(published.getTime());

    // Nyeste dato registreres på tværs af ALLE items, også dem vi kasserer.
    // Er den nyeste artikel i feedet fra marts, ved vi at et tomt resultat
    // skyldes, at der intet nyt findes — ikke at vi filtrerer forkert.
    if (hasDate && (!newest || published! > newest)) {
      newest = published!;
    }

    const sourceName = sourceMatch ? decodeEntities(sourceMatch[1]) : "Google News";
    if (!isDanishSource(sourceName)) {
      notDanish++;
      continue;
    }

    if (!hasDate) {
      noDate++;
      continue;
    }
    if (cutoff && published! < cutoff) {
      tooOld++;
      continue;
    }

    if (items.length < maxItems) {
      items.push({
        title: decodeEntities(titleMatch[1]),
        url: decodeEntities(linkMatch[1]),
        source: sourceName,
        publishedAt: published!.toISOString(),
      });
    }
  }

  return { items, total: itemBlocks.length, notDanish, tooOld, noDate, newest };
}

export async function fetchNews(keyword: string): Promise<FoundItem[]> {
  const cutoff = cutoffDate();

  // Forespørgslen holdes bevidst simpel: kun søgeordet og de danske
  // lokaliseringsparametre. Både "when:1d" og en lang række "site:"-operatorer
  // har vist sig at få Google til at svare med et helt tomt feed i stedet for
  // en fejl. Dansk afgrænsning og datofiltrering sker i koden herunder, hvor
  // vi kan se hvad der sker.
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    keyword
  )}&hl=da&gl=DK&ceid=DK:da`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Google News RSS svarede med status ${res.status}`);
  }

  const xml = await res.text();
  const parsed = parseGoogleNewsRss(xml, 25, cutoff);

  console.log(
    `[nyheder] "${keyword}": ${parsed.total} i feed → ${parsed.items.length} beholdt ` +
      `(${parsed.notDanish} ikke-danske, ${parsed.tooOld} ældre end ${MAX_AGE_HOURS}t, ${parsed.noDate} uden dato). ` +
      `Nyeste i feed: ${parsed.newest ? parsed.newest.toISOString() : "ingen"}`
  );

  return parsed.items;
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
    // Nulstil cachen, så en udløbet/afvist token ikke hænger fast til næste kørsel.
    redditTokenCache = null;
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
  const cutoff = cutoffDate();
  const token = await getRedditAccessToken();
  const userAgent =
    process.env.REDDIT_USER_AGENT || "server:gossip-alert:v1.0 (by /u/yourusername)";

  const url =
    `https://oauth.reddit.com/search` +
    `?q=${encodeURIComponent(keyword)}` +
    `&sort=new` +
    `&t=day` +
    `&limit=25` +
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
 * uden tidszone, mens serveren kører i UTC — uden lidt luft kan vi tabe fund,
 * der lige er landet.
 */
const FT_GRACE_MS = 3 * 60 * 60 * 1000;

export async function fetchFolketinget(keyword: string): Promise<FoundItem[]> {
  const escapedKeyword = keyword.replace(/'/g, "''");

  // Vi bruger Dokument frem for Sag. Sag har kun "opdateringsdato", som ændrer sig,
  // hver gang Folketinget rører en gammel række — det er derfor betænkninger og
  // §20-spørgsmål fra 2015 dukkede op som "nye". Dokument har en rigtig "dato".
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
        publishedAt: Number.isNaN(published.getTime())
          ? ""
          : published.toISOString(),
      };
    })
    .filter((item) => item.publishedAt !== "");

  console.log(
    `[folketinget] "${keyword}": ${rows.length} dokumenter siden ${cutoffLiteral} → ${items.length} brugbare`
  );

  return items;
}

export type TopStory = FoundItem;

const GOSSIP_TOPIC_WORDS = ["kendis", "reality", "underholdning", "royale"];
const GOSSIP_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

async function fetchGossipFeed(): Promise<FoundItem[]> {
  // Samme princip som fetchNews: ingen "when:"-operator og ingen "site:"-liste.
  const query = GOSSIP_TOPIC_WORDS.join(" OR ");
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=da&gl=DK&ceid=DK:da`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Google News RSS svarede med status ${res.status}`);
  }

  const xml = await res.text();
  const cutoff = new Date(Date.now() - GOSSIP_MAX_AGE_MS);
  const parsed = parseGoogleNewsRss(xml, 20, cutoff);

  console.log(
    `[forside] ${parsed.total} i feed → ${parsed.items.length} historier ` +
      `(nyeste: ${parsed.newest ? parsed.newest.toISOString() : "ingen"})`
  );

  return parsed.items;
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
