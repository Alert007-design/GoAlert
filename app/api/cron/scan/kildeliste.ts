// Reservelisten over kilder.
//
// Kilderne styres normalt fra Airtable-tabellen "Sources", så de kan
// tilføjes og fjernes uden kodeændringer. Denne liste bruges kun, hvis
// tabellen ikke kan læses — fx fordi den endnu ikke er oprettet, eller fordi
// Airtable er nede. Uden den ville en manglende tabel betyde en tavs dag
// uden overvågning, og det er værre end en lidt forældet liste.
//
// Listen er den samme som de anbefalede kilder, så de to aldrig kan komme
// til at sige noget forskelligt. Skal en kilde tilføjes eller fjernes, sker
// det ét sted: i anbefalede-kilder.ts — og kun med en bekræftet adresse.
//
// Et mediefeed indeholder typisk kun de seneste 10-50 artikler. Med én daglig
// kørsel kan travle feeds nå at rulle forbi mellem to scanninger — det er en
// kendt begrænsning, ikke en fejl.

import { ANBEFALEDE_KILDER } from "./anbefalede-kilder";

export type Feed = {
  /** Vises som kildenavn i mails og i Airtable. */
  name: string;
  url: string;
  /**
   * Er adressen afprøvet med et rigtigt kald?
   *
   * Alle kilder i den anbefalede liste ER afprøvet — det er betingelsen for
   * at stå der. Kør `npx tsx scripts/tjek-kilder.ts` for at efterprøve det.
   */
  verified: boolean;
};

export const FALLBACK_FEEDS: Feed[] = ANBEFALEDE_KILDER.filter(
  (k) => k.type === "feed"
).map((k) => ({
  name: k.name,
  url: k.url,
  verified: Boolean(k.bekræftet),
}));
