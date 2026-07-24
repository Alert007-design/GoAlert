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

function stripHtml(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, "")).trim();
}

// Kendte danske medier. Google News' hl=da&gl=DK er kun en blød bias, ikke et
// hårdt landefilter — dansk og norsk ligger sprogligt så tæt på hinanden, at
// norske kilder (VG, Aftenposten, Nettavisen, Adressa m.fl.) ofte slipper
// igennem alligevel. Denne liste bruges til at filtrere resultaterne, så kun
// genkendte danske medier beholdes.
//
// Listen er ikke udtømmende — mindre eller meget lokale danske medier, der
// ikke står her, vil blive sorteret fra. Sig til, hvis et rigtigt dansk
// medie mangler på listen, så tilføjer vi det.
//
// NB: "TV 2"/"TV2" er bevidst ikke på listen — navnet deles af den danske og
// den norske TV 2, og kan ikke skelnes ud fra kildenavnet alene. At inkludere
// det gav falske positiver fra norsk TV 2. Sig til, hvis I hellere vil have
// det med, på trods af risikoen for norsk støj.
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

export function isDanishSource(sourceName: string): boolean {
  const normalized = sourceName.toLowerCase().trim();
  if (!normalized) return false;
  // Domænenavne der tydeligt slutter på .dk regnes som danske uden videre.
  if (/\.dk$/i.test(normalized)) return true;
  return DANISH_SOURCES.some(
    (known) => normalized === known || normalized.includes(known)
  );
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

export type TopStory = FoundItem & { excerpt?: string };

// Henter Google News' danske forside-feed (ikke søgeordsbaseret) og
// filtrerer til danske kilder, ligesom fetchNews(). Bruges kun til det
// redaktionelle panel på forsiden — ikke til kundeovervågningen.
//
// Cachet i 24 timer via Next.js' fetch-cache (se kaldet i page.tsx), så
// Google News kun rammes én gang om dagen, uanset hvor mange besøgende der
// er på siden.
export async function fetchTopDanishStories(maxCount = 3): Promise<TopStory[]> {
  const url = "https://news.google.com/rss?hl=da&gl=DK&ceid=DK:da";

  const res = await fetch(url, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`Google News forside-feed svarede med status ${res.status}`);
  }

  const xml = await res.text();
  const itemBlocks = xml.split("<item>").slice(1);

  const seenSources = new Set<string>();
  const stories: TopStory[] = [];

  for (const block of itemBlocks) {
    if (stories.length >= maxCount) break;

    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/);
    if (!titleMatch || !linkMatch) continue;

    const sourceName = sourceMatch ? decodeEntities(sourceMatch[1]) : "Google News";
    if (!isDanishSource(sourceName)) continue;

    // Foretræk spredning på tværs af kilder, så panelet ikke viser 3
    // historier fra samme medie.
    if (seenSources.has(sourceName)) continue;
    seenSources.add(sourceName);

    const rawTitle = decodeEntities(titleMatch[1]);
    // Google News' titler har ofte " - Kildenavn" til sidst; det er allerede
    // vist separat, så det fjernes for at undgå gentagelse.
    const title = rawTitle.replace(new RegExp(`\\s*-\\s*${sourceName}$`), "").trim();

    let excerpt: string | undefined;
    if (descMatch) {
      const cleaned = stripHtml(descMatch[1]);
      // Google News' description er ofte bare titlen gentaget — spring den
      // over i så fald, i stedet for at vise den samme tekst to gange.
      if (cleaned && cleaned.toLowerCase() !== rawTitle.toLowerCase()) {
        excerpt = cleaned;
      }
    }

    stories.push({
      title,
      url: decodeEntities(linkMatch[1]),
      source: sourceName,
      excerpt,
    });
  }

  return stories;
}
