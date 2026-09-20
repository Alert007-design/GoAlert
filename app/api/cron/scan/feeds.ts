// Hentning og læsning af feeds.
//
// Selve LISTEN over kilder ligger ikke længere her. Den styres fra
// Airtable-tabellen "Sources" (se sources-table.ts), så kilder kan tilføjes
// og fjernes uden kodeændringer. Reservelisten ligger i kildeliste.ts og
// bruges kun, hvis tabellen ikke kan læses.
//
// Baggrund for at hente fra mediernes egne feeds: Google News' RSS-søgning
// leverede udelukkende norske kilder, uanset at vi bad om hl=da&gl=DK, og det
// nyeste indhold var flere måneder gammelt.
//
// Et mediefeed indeholder typisk kun de seneste 10-50 artikler. Med én daglig
// kørsel kan travle feeds nå at rulle forbi mellem to scanninger — det er en
// kendt begrænsning, ikke en fejl.

import { parsePublishedAt } from "./dates";
import { getSources, type Kilde } from "./sources-table";

export type { Feed } from "./kildeliste";
export { FALLBACK_FEEDS } from "./kildeliste";

export type FoundItem = {
  title: string;
  url: string;
  source: string;
  /** ISO 8601. Kildens eget udgivelsestidspunkt. */
  publishedAt: string;
};

const FEED_TIMEOUT_MS = 8000;

function fromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Danske feeds koder æ, ø, å og typografiske anførselstegn som numeriske
 * HTML-referencer (&#248; = ø). Uden at oversætte dem ville titlerne stå
 * med kodestumper i mails — og et søgeord med æ/ø/å kunne aldrig matche.
 * Numeriske koder oversættes først, og &amp; til sidst, så &amp;#248;
 * ikke bliver oversat to gange.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&laquo;/g, "\u00ab")
    .replace(/&raquo;/g, "\u00bb")
    .replace(/&oslash;/g, "\u00f8")
    .replace(/&Oslash;/g, "\u00d8")
    .replace(/&aelig;/g, "\u00e6")
    .replace(/&AElig;/g, "\u00c6")
    .replace(/&aring;/g, "\u00e5")
    .replace(/&Aring;/g, "\u00c5")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Fjerner HTML og efterlader læsbar tekst.
 *
 * Tags midt inde i en sætning fjernes UDEN at efterlade et mellemrum. Ellers
 * bliver Mastodons hashtags — der skrives som `#<span>Caturday</span>` — til
 * "# Caturday" med et mellemrum for meget. Afsnit, linjeskift og lignende
 * bliver derimod til et mellemrum, så to sætninger ikke klistrer sammen.
 */
const INLINE_TAGS = /<\/?(?:span|a|strong|em|b|i|u|code|small|mark|sub|sup)(?:\s[^>]*)?>/gi;

function stripTags(text: string): string {
  return text
    .replace(INLINE_TAGS, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Laver en overskrift ud af selve teksten.
 *
 * Opslag på Mastodon og Bluesky har ingen titel — det har sociale opslag
 * sjældent. Uden det her blev hvert eneste opslag kasseret, fordi parseren
 * krævede en <title>. I stedet bruges begyndelsen af opslaget som overskrift,
 * klippet ved et mellemrum så et ord ikke skæres midt over.
 */
function kortTitel(tekst: string, maks = 120): string {
  const rent = tekst.trim();
  if (!rent) return "";
  if (rent.length <= maks) return rent;

  const klippet = rent.slice(0, maks);
  const sidsteMellemrum = klippet.lastIndexOf(" ");
  return (sidsteMellemrum > maks * 0.6 ? klippet.slice(0, sidsteMellemrum) : klippet) + "…";
}

function firstMatch(block: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = block.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * Wikipedias historik-feed nævner ikke selv, hvilken artikel det handler om —
 * men artiklens navn står i adressen (`?title=Mette_Frederiksen`). Det hentes
 * ud her, så det kan lægges til søgefeltet.
 */
export function artikelnavnFraWikipediaUrl(url: string): string {
  try {
    const titel = new URL(url).searchParams.get("title");
    return titel ? titel.replace(/_/g, " ") : "";
  } catch {
    return "";
  }
}

/** Ét indlæg fra et feed, inden nøgleordsfiltrering. */
export type FeedEntry = {
  title: string;
  url: string;
  source: string;
  /** rss, youtube, mastodon, bluesky, wikipedia … Sat fra kildens Platform. */
  platform: string;
  /** Kildens rå datotekst. Sendes videre til den centrale aldersregel. */
  publishedRaw: string;
  /** Samme dato omregnet til UTC. Null hvis den ikke kunne læses. */
  published: Date | null;
  /** Feedets eget resumé, renset for HTML. Bruges som uddrag i mailen. */
  summary: string;
  /**
   * Titel og resumé samlet med et LINJESKIFT imellem, i små bogstaver.
   * Linjeskiftet er med vilje: et søgeord med flere ord må ikke kunne matche
   * hen over overgangen fra titel til resumé og give et falsk træf.
   */
  haystack: string;
};

/**
 * Håndterer både RSS (<item>) og Atom (<entry>). Danske medier bruger
 * overvejende RSS, men et par stykker leverer Atom.
 */
export function parseFeed(
  xml: string,
  sourceName: string,
  platform = "rss",
  /**
   * Ekstra tekst der lægges til hvert indlægs søgefelt.
   *
   * Bruges til Wikipedia: historik-feedet indeholder kun redigeringens
   * kommentar og selve ændringen — ikke artiklens navn. Overvåger man sit
   * eget navn, ville en rettelse i ens egen artikel derfor IKKE give et
   * træf, medmindre navnet tilfældigvis stod i den ændrede tekst. Ved at
   * lægge artiklens navn til søgefeltet bliver enhver rettelse i artiklen
   * til en omtale, hvilket er hele formålet med at overvåge den.
   */
  ekstraSøgetekst = ""
): FeedEntry[] {
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = isAtom
    ? xml.split(/<entry[\s>]/i).slice(1)
    : xml.split(/<item[\s>]/i).slice(1);

  const entries: FeedEntry[] = [];

  for (const block of blocks) {
    // Titlen må gerne mangle — se nedenfor. Linket og datoen må ikke.
    const rawTitle = firstMatch(block, [/<title[^>]*>([\s\S]*?)<\/title>/i]);

    const rawLink =
      firstMatch(block, [/<link[^>]*>([\s\S]*?)<\/link>/i]) ||
      firstMatch(block, [/<link[^>]*href=["']([^"']+)["']/i]) ||
      firstMatch(block, [/<guid[^>]*>([\s\S]*?)<\/guid>/i]);
    if (!rawLink) continue;

    const rawDate = firstMatch(block, [
      /<pubDate>([\s\S]*?)<\/pubDate>/i,
      /<published>([\s\S]*?)<\/published>/i,
      /<updated>([\s\S]*?)<\/updated>/i,
      /<dc:date>([\s\S]*?)<\/dc:date>/i,
    ]);
    if (!rawDate) continue;

    // Datoen tolkes ét sted (dates.ts), så tidszoner håndteres ens for alle
    // kilder. Kan den ikke læses, springes indlægget over her — det må aldrig
    // gå videre uden dato og få "nu" påklistret senere.
    const publishedRaw = decodeEntities(rawDate);
    const parsedDate = parsePublishedAt(publishedRaw);
    if (!parsedDate) continue;

    // Resuméet kan hedde mange ting alt efter platform. content:encoded først,
    // fordi den indeholder hele teksten, hvor description ofte er forkortet.
    // media:description er YouTubes videobeskrivelse.
    const rawSummary =
      firstMatch(block, [
        /<content:encoded>([\s\S]*?)<\/content:encoded>/i,
        /<description>([\s\S]*?)<\/description>/i,
        /<summary[^>]*>([\s\S]*?)<\/summary>/i,
        /<media:description>([\s\S]*?)<\/media:description>/i,
        /<content[^>]*>([\s\S]*?)<\/content>/i,
      ]) || "";

    const summary = stripTags(decodeEntities(rawSummary));

    // Har indlægget ingen titel, bruges begyndelsen af teksten. Det er
    // normalen på Mastodon og Bluesky, hvor opslag ikke HAR overskrifter.
    // Er der hverken titel eller tekst, er der ikke noget at vise — og så
    // springes indlægget over.
    const title = rawTitle ? stripTags(decodeEntities(rawTitle)) : kortTitel(summary);
    if (!title) continue;

    entries.push({
      title,
      url: decodeEntities(rawLink).trim(),
      source: sourceName,
      platform,
      publishedRaw,
      published: parsedDate.date,
      summary,
      haystack: `${title}\n${summary}${ekstraSøgetekst ? `\n${ekstraSøgetekst}` : ""}`.toLowerCase(),
    });
  }

  return entries;
}

export type FeedStatus = {
  /** Airtable-rækkens id, hvis kilden kommer fra tabellen. */
  id: string | null;
  name: string;
  platform: string;
  url: string;
  ok: boolean;
  status: number | null;
  antal: number;
  nyeste: string | null;
  fejl: string | null;
};

export type FeedHarvest = {
  entries: FeedEntry[];
  status: FeedStatus[];
  /** Kom kildelisten fra Airtable, eller blev reservelisten brugt? */
  fraTabel: boolean;
  kildeBegrundelse: string;
};

async function fetchOneFeed(kilde: Kilde): Promise<{ entries: FeedEntry[]; status: FeedStatus }> {
  const grundstatus = {
    id: kilde.id,
    name: kilde.name,
    platform: kilde.platform,
    url: kilde.url,
  };

  try {
    const res = await fetch(kilde.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      headers: {
        // Nogle medier afviser forespørgsler uden en genkendelig klient.
        "User-Agent": "GossipAlert/1.0 (+https://gossipalert.dk)",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });

    if (!res.ok) {
      return {
        entries: [],
        status: {
          ...grundstatus,
          ok: false,
          status: res.status,
          antal: 0,
          nyeste: null,
          fejl: `HTTP ${res.status}`,
        },
      };
    }

    const xml = await res.text();
    const ekstra =
      kilde.platform === "wikipedia" ? artikelnavnFraWikipediaUrl(kilde.url) : "";
    const entries = parseFeed(xml, kilde.name, kilde.platform, ekstra);
    const tidspunkter = entries
      .map((e) => e.published?.getTime())
      .filter((t): t is number => typeof t === "number");
    const nyeste = tidspunkter.length
      ? new Date(Math.max(...tidspunkter)).toISOString()
      : null;

    return {
      entries,
      status: {
        ...grundstatus,
        ok: entries.length > 0,
        status: res.status,
        antal: entries.length,
        nyeste,
        fejl: entries.length === 0 ? "Svarede, men ingen læsbare indlæg" : null,
      },
    };
  } catch (err) {
    return {
      entries: [],
      status: {
        ...grundstatus,
        ok: false,
        status: null,
        antal: 0,
        nyeste: null,
        fejl: String(err),
      },
    };
  }
}

// Feeds hentes én gang pr. kørsel og genbruges på tværs af kunder og søgeord.
// Uden det ville en scanning med tre kunder og to søgeord hente hver kilde
// seks gange.
let harvestCache: { data: FeedHarvest; at: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export async function harvestFeeds(force = false): Promise<FeedHarvest> {
  if (!force && harvestCache && Date.now() - harvestCache.at < CACHE_MS) {
    return harvestCache.data;
  }

  const { kilder, fraTabel, begrundelse } = await getSources(force);

  // Kun kilder af typen "feed" hentes her. Typen "search" spørger pr. søgeord
  // og håndteres et andet sted, når den slags kilder tages i brug.
  const feedKilder = kilder.filter((k) => k.type === "feed");

  const results = await Promise.all(feedKilder.map((k) => fetchOneFeed(k)));

  const data: FeedHarvest = {
    entries: results.flatMap((r) => r.entries),
    status: results.map((r) => r.status),
    fraTabel,
    kildeBegrundelse: begrundelse,
  };

  const virkende = data.status.filter((s) => s.ok).length;
  console.log(
    `[feeds] ${virkende}/${feedKilder.length} kilder svarede — ${data.entries.length} indlæg i alt`
  );

  harvestCache = { data, at: Date.now() };
  return data;
}
