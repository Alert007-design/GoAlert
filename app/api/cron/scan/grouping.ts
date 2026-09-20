// Dedup og gruppering.
//
// Tre slags gentagelser skal fanges:
//
//   1. Omtalen er sendt før (på en tidligere dag). Fanges mod de URL'er, vi
//      allerede har gemt i Airtable.
//   2. Omtalen optræder flere gange i SAMME kørsel — fordi to af kundens
//      søgeord rammer den samme artikel, eller fordi artiklen ligger i flere
//      feeds fra samme medie.
//   3. Den samme historie er bragt af flere medier (typisk et Ritzau-telegram).
//      Det er reelt én nyhed, og den skal vises som én linje med "også bragt i",
//      ikke som fem næsten ens punkter.
//
// Punkt 1 og 2 løses på normaliseret URL. Punkt 3 kan ikke løses på URL —
// medierne har hver sin — så der sammenlignes overskrifter.

import type { FreshItem } from "./freshness";
import { normalizeUrl } from "./urls";

export type GroupedItem = {
  /** Den version af historien vi viser: den først udgivne. */
  primary: FreshItem;
  /** Navne på de øvrige medier, der bragte samme historie. */
  alsoIn: string[];
  /**
   * HELE gruppen med normaliseret URL.
   *
   * Alle medlemmer skal gemmes i Airtable, også dem vi ikke viser i mailen.
   * Ellers ville den skjulte version tælle som ny i morgen og udløse en dublet.
   */
  members: { item: FreshItem; url: string }[];
};

/** Ord der ikke siger noget om, hvilken historie der er tale om. */
const STOPORD = new Set([
  "og", "i", "at", "det", "en", "et", "den", "til", "er", "som", "på", "de",
  "med", "har", "af", "for", "der", "om", "fra", "var", "kan", "vil", "ikke",
  "men", "så", "efter", "nu", "live", "opdateres", "breaking",
]);

/**
 * Skærer en overskrift ned til de ord, der bærer betydningen.
 *
 * Mediernes egne tilføjelser ("– DR Nyheder", "| Politiken") fjernes først,
 * så den samme historie ikke ser forskellig ud alene på grund af afsenderen.
 */
export function titleTokens(title: string): Set<string> {
  const udenMedie = title.replace(/\s+[-–—|]\s+[^-–—|]{1,40}$/u, "");

  const ord = udenMedie
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPORD.has(w));

  return new Set(ord);
}

/**
 * Hvor ens er to overskrifter, på en skala fra 0 til 1?
 * 1 betyder "præcis de samme betydningsbærende ord".
 */
export function titleSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let fælles = 0;
  for (const ord of a) if (b.has(ord)) fælles++;

  // Dice-koefficient: dobbelt antal fælles ord delt med det samlede antal.
  return (2 * fælles) / (a.size + b.size);
}

/** Over denne grænse regnes to overskrifter som samme historie. */
const LIGHEDSGRÆNSE = 0.8;

/**
 * Fjerner gentagelser og samler samme historie på tværs af medier.
 *
 * `seen` indeholder de normaliserede URL'er, kunden allerede har fået — og
 * udvides undervejs med det, denne kørsel tager med, så den samme artikel
 * ikke kan slippe igennem to gange i samme kørsel. Sættet ændres direkte,
 * fordi det deles på tværs af kundens søgeord.
 */
export function dedupeAndGroup(
  items: FreshItem[],
  seen: Set<string>
): {
  grouped: GroupedItem[];
  sprungetOverKendt: number;
  slåetSammen: number;
} {
  let sprungetOverKendt = 0;

  // Trin 1: væk med alt vi har set før — på tværs af dage og inden for kørslen.
  const unikke: { item: FreshItem; url: string }[] = [];
  for (const item of items) {
    const url = normalizeUrl(item.url);
    if (!url) continue;
    if (seen.has(url)) {
      sprungetOverKendt++;
      continue;
    }
    seen.add(url);
    unikke.push({ item, url });
  }

  // Trin 2: ældst først, så den der bragte historien først bliver den, vi viser.
  unikke.sort(
    (a, b) => new Date(a.item.publishedAt).getTime() - new Date(b.item.publishedAt).getTime()
  );

  const grupper: {
    primary: FreshItem;
    tokens: Set<string>;
    members: { item: FreshItem; url: string }[];
  }[] = [];
  let slåetSammen = 0;

  for (const { item, url } of unikke) {
    const tokens = titleTokens(item.title);

    const match = grupper.find((g) => titleSimilarity(g.tokens, tokens) >= LIGHEDSGRÆNSE);
    if (match) {
      match.members.push({ item, url });
      slåetSammen++;
      continue;
    }

    grupper.push({ primary: item, tokens, members: [{ item, url }] });
  }

  const grouped: GroupedItem[] = grupper.map((g) => {
    const andreKilder: string[] = [];
    for (const m of g.members) {
      if (m.item.source === g.primary.source) continue;
      if (andreKilder.includes(m.item.source)) continue;
      andreKilder.push(m.item.source);
    }
    return { primary: g.primary, alsoIn: andreKilder, members: g.members };
  });

  // Nyeste øverst i mailen.
  grouped.sort(
    (a, b) =>
      new Date(b.primary.publishedAt).getTime() - new Date(a.primary.publishedAt).getTime()
  );

  return { grouped, sprungetOverKendt, slåetSammen };
}
