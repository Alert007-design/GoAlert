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
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// VIGTIG BAGGRUND (fundet ved fejlsøgning 24/7-2026):
// Google News' "hl=da&gl=DK&ceid=DK:da"-parametre bliver IGNORERET af Google,
// som i stedet geo-lokaliserer ud fra den kaldende servers IP-adresse — og
// Vercel-funktionens IP geo-lokaliseres til Norge (bekræftet: Google svarede
// selv med hl=no&gl=NO&ceid=NO:no i sit eget feed, uanset hvad vi bad om, og
// selv en Accept-Language: da-DK-header ændrede intet). Det er derfor norske
// kilder som VG, Aftenposten og Nettavisen konsekvent er dukket op.
//
// Løsningen er at binde søgningen direkte til navngivne danske domæner med
// Googles "site:"-operator, som er en hård indholdsfiltrering og IKKE
// påvirkes af geo-gætteriet. Det er nu den primære mekanisme for dansk
// indhold — testet og bekræftet med "kendis", "Trump" og "Superligaen", som
// alle gav 100% danske kilder (B.T., Berlingske, Politiken, DR, TV 2).
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

// Bevaret som en ekstra sikkerhedskontrol (defense in depth) efter
// domænefilteret ovenfor — ikke længere den primære mekanisme, men et
// billigt sidste filter, hvis Google mod forventning skulle returnere noget
// uden for de navngivne domæner.
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
      if (!isDanishSource(sourceName)) continue; // ekstra sikkerhedsnet
      items.push({
        title: decodeEntities(titleMatch[1]),
        url: decodeEntities(linkMatch[1]),
        source: sourceName,
      });
    }
  }
  return items;
}

// Bruges af selve kundeovervågningen (scan-jobbet). Skal ALTID hente friske
// data — ingen cache — da cron-jobbet tjekker for nye artikler hver gang.
export async function fetchNews(keyword: string): Promise<FoundItem[]> {
  const query = `${keyword} ${SITE_CLAUSE}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=da&gl=DK&ceid=DK:da`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google News RSS svarede med status ${res.status}`);
  }

  const xml = await res.text();
  return parseGoogleNewsRss(xml, 10);
}

// Reddit er droppet som kilde (se tidligere beslutning: Reddit blokerer
// forespørgsler fra server-IP'er med 403, og officiel kommerciel API-adgang
// kræver nu forudgående godkendelse og har en betydelig minimumspris).
// Funktionen er bevaret, men bruges ikke længere i scan/route.ts.
export async function fetchReddit(keyword: string): Promise<FoundItem[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
    keyword
  )}&sort=new&limit=10`;

  const res = await fetch(url, {
    headers: { "User-Agent": "gossip-alert-bot/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Reddit svarede med status ${res.status}`);
  }

  const data = await res.json();
  const items: FoundItem[] = (data.data?.children || []).map((c: any) => ({
    title: c.data.title,
    url: `https://www.reddit.com${c.data.permalink}`,
    source: `Reddit (r/${c.data.subreddit})`,
  }));
  return items;
}

// ---------- Folketingets åbne data (Fase 3) ----------

// Folketingets egen åbne OData-API (oda.ft.dk) — gratis, ingen nøgle
// nødvendig, officielt sanktioneret. Søger i "Sag" (lovforslag,
// beslutningsforslag, forespørgsler m.v.) efter titler, der indeholder
// søgeordet. Særligt relevant for kunder, der overvåger politikere, partier
// eller politiske emner.
//
// Kilde til API-struktur: oda.ft.dk's egen dokumentation og
// eksempelforespørgsler (substringof-filter på "titel"-feltet).
export async function fetchFolketinget(keyword: string): Promise<FoundItem[]> {
  const escapedKeyword = keyword.replace(/'/g, "''"); // OData-escaping af enkelt-anførselstegn
  const filter = `substringof('${escapedKeyword}',titel)`;
  const url =
    `https://oda.ft.dk/api/Sag?$format=json&$top=10&$orderby=opdateringsdato desc` +
    `&$filter=${encodeURIComponent(filter)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Folketingets åbne data svarede med status ${res.status}`);
  }

  const data = await res.json();
  const rows: any[] = data.value || [];

  return rows
    .filter((sag) => sag.titel)
    .map((sag) => ({
      title: sag.titel as string,
      // oda.ft.dk leverer ikke selv et menneskelæsbart link pr. sag — vi
      // linker derfor til Folketingets egen søgning på sagens titel, så
      // brugeren kan finde og læse den fulde sag.
      url: `https://www.ft.dk/da/search?as=1&q=${encodeURIComponent(sag.titel)}`,
      source: "Folketinget (åbne data)",
    }));
}


export type TopStory = FoundItem;

// Domæner der reelt er sladder-/kendisfokuserede, i modsætning til den
// bredere DANISH_DOMAINS-liste ovenfor (som bruges til kundeovervågningen og
// også indeholder seriøse medier som DR, Politiken, Berlingske). Det er
// forskellen mellem "dansk kilde" og "dansk sladderkilde" — begge dele skal
// være opfyldt, for at noget passer til dette panel.
const GOSSIP_DOMAINS = ["seoghoer.dk", "billedbladet.dk", "eb.dk", "bt.dk"];
const GOSSIP_TOPIC_WORDS = ["kendis", "reality", "underholdning", "royale"];

// Cachet i 24 timer via Next.js' fetch-cache, så Google News kun rammes én
// gang om dagen for forsidepanelet. Denne cache må IKKE bruges i cron-jobbet
// (fetchNews) — det skal altid have friske data.
//
// "when:2d" begrænser til de seneste to døgn, så panelet ikke kan finde
// gamle, men stadig "relevante" sider (fx en fast programside for en
// dokumentar) i stedet for reelt friske nyheder.
//
// NB: Emneordene er samlet i ÉT opslag med OR imellem, i stedet for fire
// separate opslag (ét pr. ord). Fire separate, snævre opslag — der hver
// krævede ét bestemt ord OG en af 20 kilder OG under 2 dage gammelt — gav i
// praksis for ofte nul eller kun ét resultat. Ét bredere opslag, hvor blot
// ét af emneordene skal matche, finder markant mere.
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
    if (seenSources.has(item.source)) continue; // spred på tværs af kilder
    seenUrls.add(item.url);
    seenSources.add(item.source);
    stories.push({ ...item, title: stripSourceSuffix(item.title, item.source) });
  }

  return stories;
}

