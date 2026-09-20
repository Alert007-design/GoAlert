// Søgeordsmatchning.
//
// Tidligere blev der søgt med almindelig "indeholder"-logik. Det betød, at
// søgeordet "sos" også ramte "Kosovo" og "Sostrup", og at et navn som "Ry"
// ramte alt fra "Rygning" til "Trygfonden". Her matches derfor HELE ord.
//
// Æ, ø og å skal virke. Det gør de ikke med JavaScripts indbyggede
// ordgrænser, som kun kender a-z og 0-9 — der ville "må" i "må ikke" tælle
// som to forskellige ord. Derfor bruges en eksplicit bogstavklasse, der
// dækker alle sprogs bogstaver.

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Bygger et mønster, der kun rammer søgeordet som helt ord.
 *
 * Et søgeord med flere ord ("statsminister Frederiksen") matches som
 * sammenhængende sætning, hvor mellemrum må være ét eller flere mellemrum —
 * men ikke et linjeskift. Det er med vilje: titel og resumé sættes sammen med
 * et linjeskift, så et søgeord ikke kan matche hen over overgangen mellem dem
 * og give et falsk træf.
 */
export function buildKeywordPattern(keyword: string): RegExp | null {
  const rent = keyword.trim();
  if (!rent) return null;

  const dele = rent.split(/\s+/).map((del) => escapeRegex(del.toLowerCase()));
  const kerne = dele.join("[ \\t]+");

  // Ingen bogstaver eller tal umiddelbart før og efter. Bindestreger og
  // apostroffer tæller som grænse, så "Mette-Marit" rammes af "Mette".
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}])${kerne}(?![\\p{L}\\p{N}])`, "iu");
  } catch {
    // Skulle et søgeord mod forventning give et ugyldigt mønster, er det
    // bedre at springe det over end at vælte hele kørslen.
    console.error(`[søgeord] Kunne ikke bygge mønster for "${keyword}"`);
    return null;
  }
}

/** Matcher søgeordet som helt ord i teksten? */
export function matchesKeyword(haystack: string, keyword: string): boolean {
  const pattern = buildKeywordPattern(keyword);
  if (!pattern) return false;
  return pattern.test(haystack);
}
