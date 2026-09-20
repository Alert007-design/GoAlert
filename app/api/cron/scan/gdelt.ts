// GDELT DOC API — nyhedssøgning på tværs af medier.
//
// GDELT er SLÅET FRA som standard (GDELT_ENABLED). Se advarslen om datoer
// nederst i denne fil: den er grunden til, at den ikke bare blev tændt.
//
// To ting er lært af Google News, som blev droppet:
//
//   1. Man kan ikke stole på en udbyders eget landefilter. Vi sender
//      sourcecountry:DA med, men kontrollerer BAGEFTER hver eneste artikel
//      med vores egen danske kontrol. GDELT's filter er et hint, ikke et svar.
//   2. Man kan ikke stole på, at indholdet er friskt. Alt går gennem den
//      centrale aldersregel som alt andet.

import type { RawItem } from "./freshness";
import { kunDanske } from "./danske-kilder";

const API = "https://api.gdeltproject.org/api/v2/doc/doc";

/** GDELT beder selv om højst ét kald hvert femte sekund. */
const MIN_MS_MELLEM_KALD = 5500;
let sidsteKald = 0;

async function pace(): Promise<void> {
  const venteTid = sidsteKald + MIN_MS_MELLEM_KALD - Date.now();
  if (venteTid > 0) await new Promise((r) => setTimeout(r, venteTid));
  sidsteKald = Date.now();
}

export function isGdeltEnabled(): boolean {
  return process.env.GDELT_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Bygger forespørgslen.
 *
 * Søgeordet sættes altid i anførselstegn. Uden det tolker GDELT flere ord
 * som "find artikler med et af ordene", hvilket giver larm — og ved
 * afprøvning gav enkeltord uden anførselstegn slet ingen resultater.
 */
/**
 * Landefilteret sendes med som et hint til GDELT. Det er IKKE det, der
 * afgør, om en artikel er dansk — det gør vores egen kontrol bagefter.
 *
 * Kan ændres med GDELT_FILTER, så forskellige skrivemåder kan afprøves uden
 * kodeændring. Sæt den til tom streng for at søge helt uden filter.
 */
export function landefilter(): string {
  const fra = process.env.GDELT_FILTER;
  return fra === undefined ? "sourcecountry:DA" : fra.trim();
}

export function byggeQuery(keyword: string, filter = landefilter()): string {
  const rent = keyword.trim().replace(/"/g, "");
  return filter ? `"${rent}" ${filter}` : `"${rent}"`;
}

/** GDELT skriver datoer som 20260920T174500Z. Det er ikke ISO 8601. */
export function læsGdeltDato(rå: string): string | null {
  const m = String(rå || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return null;
  const [, år, md, dag, t, min, sek] = m;
  return `${år}-${md}-${dag}T${t}:${min}:${sek}Z`;
}

export type GdeltArtikel = {
  url?: string;
  title?: string;
  domain?: string;
  seendate?: string;
  language?: string;
  sourcecountry?: string;
};

export type GdeltResultat = {
  items: RawItem[];
  /** Artikler GDELT leverede, men som vores egen kontrol afviste. */
  afvist: { kilde: string; grund: string }[];
  /** Hvor mange GDELT returnerede i alt, før filtrering. */
  leveret: number;
};

/**
 * Oversætter GDELT's svar til vores datamodel — og frasorterer alt, der ikke
 * er dansk.
 *
 * Adskilt fra selve kaldet, så filtreringen kan testes uden netværk.
 */
export function omsætSvar(artikler: GdeltArtikel[]): GdeltResultat {
  const brugbare = artikler.filter((a) => a.url && a.title);

  // Vores EGEN kontrol. GDELT's sourcecountry bruges ikke som facit —
  // det var præcis den slags tillid, der gav norske resultater fra Google News.
  const { danske, afvist } = kunDanske(brugbare, (a) => a.domain || a.url || "");

  const items: RawItem[] = danske.map((a) => ({
    title: String(a.title).trim(),
    url: String(a.url),
    source: a.domain ? `${a.domain} (via GDELT)` : "GDELT",
    platform: "gdelt",
    // Se advarslen nederst i filen: dette er tidspunktet GDELT SÅ artiklen.
    publishedAt: læsGdeltDato(String(a.seendate || "")),
  }));

  return { items, afvist, leveret: artikler.length };
}

export async function søgGdelt(
  keyword: string,
  windowStart: Date,
  filter = landefilter()
): Promise<GdeltResultat> {
  const timer = Math.max(
    1,
    Math.ceil((Date.now() - windowStart.getTime()) / 3_600_000)
  );

  const url =
    `${API}?query=${encodeURIComponent(byggeQuery(keyword, filter))}` +
    `&mode=artlist&format=json&maxrecords=75&sort=datedesc&timespan=${timer}h`;

  // GDELT er meget følsom over for kaldfrekvens og svarer både med status 429
  // og med en almindelig tekstbesked, når den synes, man spørger for tit.
  // Begge dele forsøges igen med voksende ventetid, i stedet for at kilden
  // bare ser ud til at være tom.
  let tekst = "";
  let sidsteFejl = "";

  for (let forsøg = 1; forsøg <= 3; forsøg++) {
    await pace();

    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      headers: { "User-Agent": "GossipAlert/1.0 (+https://gossipalert.dk)" },
    });

    const svar = await res.text();

    const forTit = res.status === 429 || svar.startsWith("Please limit");
    if (forTit) {
      sidsteFejl = "GDELT afviste kaldet: for mange forespørgsler på kort tid";
      if (forsøg < 3) {
        await new Promise((r) => setTimeout(r, forsøg * 8000));
        continue;
      }
      throw new Error(sidsteFejl);
    }

    if (!res.ok) {
      throw new Error(`GDELT svarede med status ${res.status}`);
    }

    tekst = svar;
    break;
  }

  if (!tekst) throw new Error(sidsteFejl || "GDELT svarede ikke");

  let data: { articles?: GdeltArtikel[] };
  try {
    data = JSON.parse(tekst);
  } catch {
    throw new Error(`GDELT svarede med noget, der ikke er JSON: ${tekst.slice(0, 120)}`);
  }

  const resultat = omsætSvar(data.articles || []);

  console.log(
    `[gdelt] "${keyword}": ${resultat.leveret} leveret → ${resultat.items.length} danske` +
      (resultat.afvist.length
        ? ` (afvist: ${resultat.afvist.slice(0, 5).map((a) => a.kilde).join(", ")}${
            resultat.afvist.length > 5 ? " m.fl." : ""
          })`
        : "")
  );

  return resultat;
}

// ---------------------------------------------------------------------------
// ADVARSEL OM DATOER — grunden til at GDELT er slået fra
// ---------------------------------------------------------------------------
//
// GDELT oplyser ikke, hvornår en artikel blev UDGIVET. Feltet seendate er
// det tidspunkt, hvor GDELT selv så artiklen.
//
// For det meste er de to næsten ens, fordi GDELT crawler hurtigt. Men ser
// GDELT en gammel artikel igen — fordi et site omlægger, genudgiver eller
// bare bliver crawlet forfra — får den en frisk seendate. En artikel fra
// 2019 kan altså se ud, som om den er fra i dag.
//
// Det er præcis det, 24-timers-reglen skal forhindre. Derfor er GDELT ikke
// tændt, før det er besluttet, om seendate er god nok som erstatning for en
// udgivelsesdato.
