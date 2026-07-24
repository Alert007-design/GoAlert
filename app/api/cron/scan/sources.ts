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

// Kendte danske medier. Google News' hl=da&gl=DK er kun en blød bias, ikke et
// hårdt landefilter — dansk og norsk ligger sprogligt så tæt på hinanden, at
// norske kilder (VG, Aftenposten, Nettavisen, Adressa m.fl.) ofte slipper
// igennem alligevel. Denne liste bruges til at filtrere resultaterne, så kun
// genkendte danske medier beholdes.
//
// Listen er ikke udtømmende — mindre eller meget lokale danske medier, der
// ikke står her, vil blive sorteret fra. Sig til, hvis et rigtigt dansk
// medie mangler på listen, så tilføjer vi det.
const DANISH_SOURCES = [
  "dr",
  "dr nyheder",
  "tv 2",
  "tv2",
  "tv 2 nyheder",
  "tv2 nyheder",
  "tv 2 news",
  "tv2 news",
  "tv2 lorry",
  "tv2 kosmopol",
  "tv2 nord",
  "tv2 fyn",
  "tv2 øst",
  "tv2 østjylland",
  "tv2 syd",
  "tv2 bornholm",
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
];

function isDanishSource(sourceName: string): boolean {
  const normalized = sourceName.toLowerCase().trim();
  if (!normalized) return false;
  // Domænenavne der tydeligt slutter på .dk regnes som danske uden videre.
  if (/\.dk$/i.test(normalized)) return true;
  return DANISH_SOURCES.some(
    (known) => normalized === known || normalized.includes(known)
  );
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
  const items: FoundItem[] = [];
  const itemBlocks = xml.split("<item>").slice(1);
  for (const block of itemBlocks.slice(0, 10)) {
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
