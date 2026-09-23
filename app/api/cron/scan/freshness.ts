// 24-timers-reglen — håndhævet ét sted.
//
// Tidligere filtrerede hver kilde selv på alder, og de gjorde det forskelligt:
// Folketinget havde fx tre timers ekstra luft, så dens fund kunne være op til
// 27 timer gamle. Nu indsamler kilderne bredt, og ALT filtreres her til sidst.
// En ny kilde kan derfor ikke længere komme til at omgå reglen ved et uheld —
// den skal igennem enforceWindow() ligesom alle andre.

import { parsePublishedAt, toDanishLabel } from "./dates";

// Den fælles datamodel. ALLE kilder — RSS, YouTube, Mastodon, Bluesky,
// Wikipedia og hvad der siden kommer til — leverer præcis disse felter.
// Det er dét, der gør, at en ny kilde kan tilføjes uden at røre resten af
// systemet: mail, dedup og aldersregel kender kun denne form.

/** Et fund, som det ser ud FØR aldersreglen er anvendt. */
export type RawItem = {
  title: string;
  url: string;
  /** Vises som kildenavn, fx "DR Indland". */
  source: string;
  /** Hvilken slags kilde: rss, youtube, mastodon, bluesky, wikipedia … */
  platform: string;
  /** Rå datotekst fra kilden. Må gerne være null — så kasseres fundet. */
  publishedAt: string | null;
  excerpt?: string;
};

/** Et fund, der har bestået aldersreglen. Datoen er altid ægte og i UTC. */
export type FreshItem = {
  title: string;
  url: string;
  source: string;
  platform: string;
  /** ISO 8601 i UTC. Altid udfyldt. */
  publishedAt: string;
  excerpt?: string;
};

export type WindowDecision = {
  /** Fælles "nu" for hele kørslen. Bruges alle steder, så grænsen ikke skrider. */
  runAt: Date;
  /** Intet ældre end dette må med i mailen. */
  windowStart: Date;
  /** Til logning og rapportering. */
  begrundelse: string;
};

const MAX_LOOKBACK_HOURS = 48;

/**
 * Det normale vindue. Eksporteret, fordi loggen i feeds.ts måler feedenes
 * rækkevidde op mod netop dette tal — så det kun står ét sted.
 */
export const DEFAULT_WINDOW_HOURS = Number(process.env.SCAN_MAX_AGE_HOURS || 24);

/**
 * Afgør hvor langt tilbage denne kørsel må kigge.
 *
 * Vercels Hobby-plan udløser ikke cron-jobbet på et præcist minuttal — det
 * sker et tilfældigt sted inden for timen. Kører jobbet 06:05 den ene dag og
 * 06:55 den næste, er der gået 24 timer og 50 minutter, og et fast
 * 24-timers-vindue ville tabe de 50 minutters indhold.
 *
 * Derfor kigges der tilbage til sidste VELLYKKEDE kørsel, når vi kender den.
 * Er der gået længere end 48 timer (fx efter et nedbrud), skæres der ved 48,
 * så en enkelt dårlig uge ikke udløser en mail med hundredvis af omtaler.
 * Kender vi ikke sidste kørsel, bruges det normale 24-timers-vindue.
 */
export function decideWindow(runAt: Date, lastSuccessfulRun: Date | null): WindowDecision {
  const standard = new Date(runAt.getTime() - DEFAULT_WINDOW_HOURS * 3600_000);
  const loft = new Date(runAt.getTime() - MAX_LOOKBACK_HOURS * 3600_000);

  if (!lastSuccessfulRun || Number.isNaN(lastSuccessfulRun.getTime())) {
    return {
      runAt,
      windowStart: standard,
      begrundelse: `Ingen tidligere kørsel kendt — bruger ${DEFAULT_WINDOW_HOURS} timer.`,
    };
  }

  // Sidste kørsel ligger i fremtiden (uret er løbet forkert) — stol ikke på den.
  if (lastSuccessfulRun > runAt) {
    return {
      runAt,
      windowStart: standard,
      begrundelse: `Sidste kørsel lå i fremtiden — bruger ${DEFAULT_WINDOW_HOURS} timer i stedet.`,
    };
  }

  if (lastSuccessfulRun < loft) {
    return {
      runAt,
      windowStart: loft,
      begrundelse:
        `Sidste kørsel var ${toDanishLabel(lastSuccessfulRun)} — mere end ` +
        `${MAX_LOOKBACK_HOURS} timer siden, så der skæres ved ${MAX_LOOKBACK_HOURS} timer.`,
    };
  }

  // Ligger sidste kørsel tættere på end 24 timer, bruges det korte vindue.
  // Ellers strækkes vinduet præcis tilbage til sidste kørsel.
  if (lastSuccessfulRun > standard) {
    return {
      runAt,
      windowStart: standard,
      begrundelse:
        `Sidste kørsel var ${toDanishLabel(lastSuccessfulRun)} — under ` +
        `${DEFAULT_WINDOW_HOURS} timer siden, så det normale vindue bruges.`,
    };
  }

  return {
    runAt,
    windowStart: lastSuccessfulRun,
    begrundelse: `Kigger tilbage til sidste vellykkede kørsel ${toDanishLabel(lastSuccessfulRun)}.`,
  };
}

export type FreshnessResult = {
  fresh: FreshItem[];
  /** Antal fund kasseret, fordelt på årsag — til logning. */
  kasseret: {
    udenDato: number;
    forGammelt: number;
    iFremtiden: number;
    kunDagKendt: number;
  };
};

/**
 * Den centrale aldersregel. Alle kilder, også nye, skal igennem her.
 *
 * Regler:
 *  - Et fund uden læsbar dato kasseres og logges. Det får ALDRIG "nu" som
 *    dato, for så ville gammelt indhold snige sig ind i mailen.
 *  - Et fund, hvor kilden kun oplyser dagen (klokkeslæt midnat), regnes fra
 *    døgnets begyndelse i dansk tid. Det er det tidligst mulige tidspunkt, og
 *    dermed det forsigtige valg: vi påstår aldrig, at noget er nyere end det er.
 *  - Et fund dateret i fremtiden kasseres. En forkert dato i en kilde må ikke
 *    kunne holde en omtale kunstigt "frisk" i dagevis.
 */
export function enforceWindow(
  items: RawItem[],
  windowStart: Date,
  runAt: Date
): FreshnessResult {
  const fresh: FreshItem[] = [];
  const kasseret = { udenDato: 0, forGammelt: 0, iFremtiden: 0, kunDagKendt: 0 };

  // Lidt luft fremad, så et par minutters forskel mellem kildens ur og vores
  // ikke kasserer en helt ny artikel.
  const fremtidsgrænse = new Date(runAt.getTime() + 60 * 60_000);

  for (const item of items) {
    const parsed = parsePublishedAt(item.publishedAt);

    if (!parsed) {
      kasseret.udenDato++;
      console.warn(
        `[alder] Kasseret uden brugbar dato: "${item.title.slice(0, 80)}" (${item.source})`
      );
      continue;
    }

    if (parsed.date > fremtidsgrænse) {
      kasseret.iFremtiden++;
      console.warn(
        `[alder] Kasseret, dateret i fremtiden (${parsed.date.toISOString()}): ` +
          `"${item.title.slice(0, 80)}" (${item.source})`
      );
      continue;
    }

    if (parsed.date < windowStart) {
      kasseret.forGammelt++;
      if (parsed.precision === "day") kasseret.kunDagKendt++;
      continue;
    }

    fresh.push({
      title: item.title,
      url: item.url,
      source: item.source,
      platform: item.platform,
      publishedAt: parsed.date.toISOString(),
      excerpt: item.excerpt,
    });
  }

  return { fresh, kasseret };
}
