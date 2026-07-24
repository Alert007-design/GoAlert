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

// Kendte danske medier. Google News' hl=da&gl=DK er kun en blød bias, ikke et
// hårdt landefilter — dansk og norsk ligger sprogligt så tæt på hinanden, at
// norske kilder ofte slipper igennem alligevel. Denne liste bruges til at
// filtrere resultaterne, så kun genkendte danske medier beholdes.
//
// Listen er ikke udtømmende — mindre eller meget lokale danske medier, der
// ikke står her, vil blive sorteret fra. Sig til, hvis et rigtigt dansk
// medie mangler på listen, så tilføjer vi det.
//
// NB: "TV 2"/"TV2" er bevidst ikke på listen — navnet deles af den danske og
// den norske TV 2, og kan ikke skelnes ud fra kildenavnet alene.
const DANISH_SOURCES = [
  "dr",
  "dr nyheder",
  "politiken",
  "jyllands-posten",
  "jyllandsposten",
  "jp",
  "berlingske",
  "ekstra bladet",
  "ekstrabladet",
  "b.t.",
  "bt",
  "information",
  "kristeligt dagblad",
  "weekendavisen",
  "altinget",
  "mandag morgen",
  "zetland",
  "finans",
  "finanswatch",
  "børsen",
  "boersen",
  "watch medier",
  "nordjyske",
  "jydskevestkysten",
  "fyens stiftstidende",
  "fyens.dk",
  "fyns amts avis",
  "randers amtsavis",
  "sjællandske",
  "sjaellandske",
  "frederiksborg amts avis",
  "dagbladet ringkøbing-skjern",
  "herning folkeblad",
  "vestkysten",
  "ritzau",
  "dagens.dk",
  "dagens medicin",
  "licitationen",
  "kommunen.dk",
  "avisen.dk",
  // Kendis- og sladdermedier — særligt relevante for et produkt som Gossip Alert.
  "se og hør",
  "seoghør",
  "seoghoer",
  "billed-bladet",
  "billedbladet",
  "her&nu",
  "her og nu",
  "herognu",
  "femina",
  "alt for damerne",
  "isabellas",
];

// NB: Tidligere brugte denne funktion "normalized.includes(known)", hvilket
// betød at korte navne som "dr" eller "finans" matchede som en delstreng
// midt i et helt andet ord — fx matchede "dr" i "Drammens Tidende", og
// "finans" matchede i "Finansavisen" (begge norske). Det lukkede norsk
// indhold ind, selvom filteret så ud til at virke. Nu kræves der et helt
// ord (afgrænset af mellemrum eller start/slut af navnet), så en delstreng
// midt i et andet ord ikke længere tæller som match.
export function isDanishSource(sourceName: string): boolean {
  const normalized = sourceName.toLowerCase().trim();
  if (!normalized) return false;
  // Domænenavne der tydeligt slutter på .dk regnes som danske uden videre.
  if (/\.dk$/i.test(normalized)) return true;
  return DANISH_SOURCES.some((known) => {
    if (normalized === known) return true;
    const wordBoundaryMatch = new RegExp(
      `(^|\\s)${escapeRegex(known)}(\\s|$)`,
      "i"
    );
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
      const sourceName = sourceMatch
        ? decodeEntities(sourceMatch[1])
        : "Google News";
      if (!isDanishSource(sourceName)) {
        continue; // spring ikke-danske kilder over
      }
      items.push({
        title: decodeEntities(titleMatch[1]),
        url: decodeEntities(linkMatch[1]),
        source: sourceName,
      });
    }
  }
  return items;
}

// NB: Tidligere fangede denne funktion ALLE fejl (netværksfejl, ikke-ok svar,
// parse-fejl) og returnerede stille en tom liste. Det gjorde det umuligt at
// skelne "ingen nye omtaler" fra "kilden kunne ikke tjekkes" i scan-jobbet.
// Nu kastes en reel fejl videre til kalderen (scan/route.ts), som fanger den
// med Promise.allSettled og rapporterer den korrekt som en kildefejl i mailen.
// En tom liste herfra betyder nu udelukkende: kaldet lykkedes, men fandt intet.
export async function fetchNews(keyword: string): Promise<FoundItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    keyword
  )}&hl=da&gl=DK&ceid=DK:da`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google News RSS svarede med status ${res.status}`);
  }

  const xml = await res.text();
  return parseGoogleNewsRss(xml, 10);
}

// Samme princip som ovenfor: en fejl fra Reddit (fx 403, som er kendt for at
// ramme forespørgsler fra server-IP'er som Vercels) skal kastes videre, ikke
// skjules som "ingen resultater".
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

// ---------- forsidens "Danmark lige nu"-panel ----------

export type TopStory = FoundItem;

// Samme Google News-søgning som fetchNews(), men cachet i 24 timer via
// Next.js' fetch-cache, så Google News kun rammes én gang om dagen for
// forsidepanelet, uanset hvor mange besøgende der er. Denne cache må IKKE
// bruges i selve cron-jobbet (fetchNews) — det skal altid have friske data.
async function fetchCachedNews(keyword: string): Promise<FoundItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    keyword
  )}&hl=da&gl=DK&ceid=DK:da`;

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) {
    throw new Error(`Google News RSS svarede med status ${res.status}`);
  }

  const xml = await res.text();
  return parseGoogleNewsRss(xml, 10);
}

// Søgeord målrettet det, panelet faktisk skal handle om: kendisser, reality,
// fodbold og underholdning — IKKE Google News' generelle forside, som viser
// almindelige hårde nyheder (politik, ulykker, erhverv).
//
// NB: Vi bruger IKKE Google News' beskrivelsesfelt til et resumé længere.
// For forsidens tidligere "top stories"-feed viste det sig at indeholde en
// hel klynge af relaterede artikler fra flere medier som rå HTML, ikke et
// rent uddrag — det gav synligt, ustrippet markup på siden. Panelet viser nu
// kun overskrift, kilde og link, som er den del af data, vi kan stole på.
const GOSSIP_QUERIES = ["kendis", "reality", "fodbold Superligaen", "underholdning"];

function stripSourceSuffix(title: string, source: string): string {
  const re = new RegExp(`\\s*-\\s*${escapeRegex(source)}$`, "i");
  return title.replace(re, "").trim();
}

export async function fetchTopDanishStories(maxCount = 3): Promise<TopStory[]> {
  const settled = await Promise.allSettled(
    GOSSIP_QUERIES.map((q) => fetchCachedNews(q))
  );

  const seenUrls = new Set<string>();
  const seenSources = new Set<string>();
  const stories: TopStory[] = [];

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) {
      if (stories.length >= maxCount) break;
      if (seenUrls.has(item.url)) continue;
      if (seenSources.has(item.source)) continue; // spred på tværs af kilder
      seenUrls.add(item.url);
      seenSources.add(item.source);
      stories.push({
        ...item,
        title: stripSourceSuffix(item.title, item.source),
      });
    }
  }

  return stories;
}
