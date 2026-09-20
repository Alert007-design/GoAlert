// Kontrol af, om en kilde er dansk.
//
// Baggrund: Google News blev droppet, fordi den leverede norske kilder,
// uanset at vi udtrykkeligt bad om danske. Lektien er, at man ikke kan stole
// på en udbyders eget landefilter. Derfor kontrollerer vi selv.
//
// Reglen er bevidst STRAM: en artikel slipper kun igennem, hvis dens
// værtsnavn ender på .dk, eller hvis domænet står på en liste over danske
// medier med et andet topdomæne. Alt andet afvises — også hvis kilden selv
// påstår, at den er dansk.
//
// Det betyder, at vi hellere taber en dansk artikel på et .com-domæne end
// sender en norsk artikel ud som dansk. Den afvejning er med vilje: en
// manglende omtale er en skuffelse, en forkert omtale er en fejl.

/**
 * Danske medier og myndigheder, der IKKE bruger .dk.
 *
 * Tilføj kun domæner her, som du har set med egne øjne. Et gæt her
 * underminerer hele kontrollen.
 */
const DANSKE_UDEN_DK_DOMÆNE = new Set<string>([
  // Tom indtil videre. Alle nuværende kilder bruger .dk.
]);

/** Topdomæner der ofte forveksles med danske. Kun til tydelig logning. */
export const NABOLANDES_DOMÆNER: Record<string, string> = {
  ".no": "norsk",
  ".se": "svensk",
  ".de": "tysk",
  ".fi": "finsk",
  ".is": "islandsk",
  ".nl": "hollandsk",
};

/** Trækker værtsnavnet ud af en adresse, uden www. og i små bogstaver. */
export function værtsnavn(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // GDELT leverer nogle gange bare et domænenavn uden protokol.
    const rent = String(url || "").trim().toLowerCase();
    if (!rent || rent.includes(" ")) return "";
    return rent.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

/**
 * Er kilden dansk?
 *
 * `kilde` må være enten en fuld adresse eller bare et domænenavn — GDELT
 * leverer begge dele.
 */
export function erDanskKilde(kilde: string): boolean {
  const vært = værtsnavn(kilde);
  if (!vært) return false;

  if (vært === "dk" || vært.endsWith(".dk")) return true;

  return DANSKE_UDEN_DK_DOMÆNE.has(vært);
}

/**
 * Forklarer hvorfor en kilde blev afvist. Bruges i loggen, så et fravalg
 * kan efterprøves i stedet for bare at ske.
 */
export function afvisningsgrund(kilde: string): string {
  const vært = værtsnavn(kilde);
  if (!vært) return "kunne ikke læse værtsnavnet";

  for (const [endelse, sprog] of Object.entries(NABOLANDES_DOMÆNER)) {
    if (vært.endsWith(endelse)) return `${sprog} domæne (${vært})`;
  }

  return `ikke et dansk domæne (${vært})`;
}

/**
 * Frasorterer alt, der ikke er dansk, og fortæller hvad der blev smidt væk.
 */
export function kunDanske<T>(
  poster: T[],
  hentKilde: (p: T) => string
): { danske: T[]; afvist: { kilde: string; grund: string }[] } {
  const danske: T[] = [];
  const afvist: { kilde: string; grund: string }[] = [];

  for (const p of poster) {
    const kilde = hentKilde(p);
    if (erDanskKilde(kilde)) {
      danske.push(p);
    } else {
      afvist.push({ kilde: værtsnavn(kilde) || kilde, grund: afvisningsgrund(kilde) });
    }
  }

  return { danske, afvist };
}
