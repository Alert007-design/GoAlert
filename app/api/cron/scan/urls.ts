// URL-normalisering.
//
// Samme artikel kan nå os ad mange veje, og hver vej giver sin egen URL:
//
//   https://www.dr.dk/nyheder/123?utm_source=rss&utm_medium=feed
//   https://dr.dk/nyheder/123/
//   http://m.dr.dk/nyheder/123#comments
//
// Det er én artikel. Uden normalisering ville kunden få den tre gange.
// Derfor køres ENHVER URL gennem normalizeUrl(), både før sammenligning og
// før lagring — og også når gamle rækker læses tilbage fra Airtable, så
// rækker gemt før denne ændring stadig tæller med i dedup'en.

/**
 * Sporingsparametre der aldrig ændrer, hvilken artikel man lander på.
 * Alt der starter med utm_ fjernes desuden mønsterbaseret.
 */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "igshid",
  "igsh",
  "mc_cid",
  "mc_eid",
  "ref",
  "referer",
  "referrer",
  "source",
  "cmpid",
  "campaign",
  "spm",
  "at_medium",
  "at_campaign",
  "s_cid",
  "ncid",
  "sh",
  "share",
  "utm",
]);

/** Værtsnavne-præfikser der peger på det samme site. */
const HOST_PREFIXES = ["www.", "m.", "mobil.", "amp."];

export function normalizeUrl(raw: string): string {
  const text = (raw || "").trim();
  if (!text) return "";

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // Ikke en gyldig adresse (fx et guid der ikke er en URL). Så bruges
    // teksten som den er, bare trimmet og med små bogstaver, så den stadig
    // kan sammenlignes stabilt med sig selv.
    return text.toLowerCase();
  }

  // Kun http(s) normaliseres. Alt andet returneres uændret.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return text.toLowerCase();
  }

  // http og https er samme artikel.
  url.protocol = "https:";

  let host = url.hostname.toLowerCase();
  for (const prefix of HOST_PREFIXES) {
    if (host.startsWith(prefix)) {
      host = host.slice(prefix.length);
      break;
    }
  }
  url.hostname = host;

  // Standardporte betyder ikke noget.
  if (url.port === "80" || url.port === "443") url.port = "";

  // Fragmenter (#afsnit) peger på et sted i den samme side.
  url.hash = "";

  // Sporingsparametre fjernes; resten sorteres, så rækkefølgen ikke
  // gør to ens adresser forskellige.
  const kept: [string, string][] = [];
  for (const [key, value] of url.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_")) continue;
    if (TRACKING_PARAMS.has(lower)) continue;
    kept.push([key, value]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);

  // Afsluttende skråstreg betyder det samme som ingen skråstreg —
  // men "/" alene er forsiden og skal blive stående.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}
