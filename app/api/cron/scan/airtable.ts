export const BASE_URL = "https://api.airtable.com/v0";

import { normalizeUrl } from "./urls";

export function airtableHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
    "Content-Type": "application/json",
  };
}

/**
 * Airtable tillader 5 kald i sekundet pr. base. Overskrides det, svarer de
 * med en fejl og spærrer i 30 sekunder. Derfor holdes der en lille pause
 * mellem skrivninger. Det er billigere end at rydde op bagefter.
 */
let sidsteKald = 0;
const MIN_MS_MELLEM_KALD = 220;

export async function pace(): Promise<void> {
  const nu = Date.now();
  const venteTid = sidsteKald + MIN_MS_MELLEM_KALD - nu;
  if (venteTid > 0) await new Promise((r) => setTimeout(r, venteTid));
  sidsteKald = Date.now();
}

/** Gør Airtables fejlsvar læsbart, i stedet for at give en tom fejlbesked. */
export async function beskrivFejl(res: Response): Promise<string> {
  let tekst = "";
  try {
    tekst = await res.text();
  } catch {
    tekst = "(kunne ikke læse svaret)";
  }

  if (res.status === 401 || res.status === 403) {
    return `${res.status} — Airtable afviste adgangen. Tjek AIRTABLE_TOKEN og at det har adgang til basen. ${tekst}`;
  }
  if (res.status === 404) {
    return `${res.status} — tabellen eller basen blev ikke fundet. Tjek AIRTABLE_BASE_ID og tabelnavnet. ${tekst}`;
  }
  if (res.status === 422) {
    return `${res.status} — Airtable afviste rækken. Som regel fordi en kolonne ikke findes, eller fordi kolonnetypen ikke passer. ${tekst}`;
  }
  if (res.status === 429) {
    return `${res.status} — for mange kald til Airtable på kort tid. ${tekst}`;
  }
  return `${res.status} ${tekst}`;
}

export type Customer = {
  id: string;
  name: string;
  email: string;
  keywords: string[];
};

// Feltet "Keywords" i Airtable kan indeholde flere søgeord adskilt af komma
// (fx "Gulspurve, nattergale"). Denne funktion splitter dem til en liste, så
// hvert søgeord kan scannes for sig i stedet for som én samlet sætning.
function parseKeywords(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export async function getActiveCustomers(): Promise<Customer[]> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const url = `${BASE_URL}/${baseId}/Customers?filterByFormula=${encodeURIComponent(
    "{Active}=1"
  )}`;

  // cache: "no-store" er ikke valgfrit her. Uden det cacher Next.js svaret,
  // og scannet kører videre på gamle kundedata — ændrede søgeord, nye
  // tilmeldinger og opsigelser ville ikke slå igennem.
  const res = await fetch(url, { headers: airtableHeaders(), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Airtable Customers-fejl: ${await beskrivFejl(res)}`);
  }

  const data = await res.json();
  return (data.records || [])
    .map((r: any) => ({
      id: r.id,
      name: r.fields.Name || "",
      email: r.fields.Email || "",
      keywords: parseKeywords(r.fields.Keywords),
    }))
    .filter((c: Customer) => c.email && c.keywords.length > 0);
}

export function logCustomers(customers: Customer[]): void {
  for (const c of customers) {
    console.log(`[kunde] ${c.email}: søgeord = ${c.keywords.join(" | ")}`);
  }
}

/**
 * Henter ALLE tidligere omtaler for en kunde — ikke kun de seneste to uger.
 *
 * Tidligere blev der kun kigget 14 dage tilbage. Det holder kun, så længe
 * ingen kilde nogensinde genudgiver en gammel artikel med en ny dato, og den
 * antagelse er for skrøbelig, når kravet er, at en omtale ALDRIG må sendes to
 * gange. Nu hentes hele historikken.
 *
 * URL'erne normaliseres på vej ind. Det betyder, at rækker gemt FØR
 * normaliseringen blev indført stadig tæller med — vi behøver ikke rette i
 * gamle data.
 */
export async function getKnownUrls(customerEmail: string): Promise<Set<string>> {
  const baseId = process.env.AIRTABLE_BASE_ID;

  const escapedEmail = customerEmail.replace(/"/g, '\\"');
  const formula = `{CustomerEmail}="${escapedEmail}"`;

  const urls = new Set<string>();
  let offset: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams();
    params.set("filterByFormula", formula);
    params.append("fields[]", "URL");
    params.set("pageSize", "100");
    if (offset) params.set("offset", offset);

    const url = `${BASE_URL}/${baseId}/Mentions?${params.toString()}`;
    // Samme grund som ovenfor: et cachet svar her ville få dedup'en til at
    // arbejde på et forældet billede af, hvad vi allerede har set.
    const res = await fetch(url, { headers: airtableHeaders(), cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Airtable Mentions-fejl: ${await beskrivFejl(res)}`);
    }

    const data = await res.json();
    for (const record of data.records || []) {
      const recordUrl = record?.fields?.URL;
      if (recordUrl) urls.add(normalizeUrl(String(recordUrl)));
    }

    offset = data.offset;
    pages++;

    // Nødbremse, så en uventet løkke ikke kan brænde hele kørslens tid af.
    if (pages >= 100) {
      console.warn(
        `[airtable] Stoppede efter ${pages} sider for ${customerEmail} — flere rækker end forventet.`
      );
      break;
    }
  } while (offset);

  console.log(
    `[airtable] ${customerEmail}: ${urls.size} kendte URL'er i alt (${pages} side(r))`
  );

  return urls;
}

export type MentionRække = {
  customerEmail: string;
  title: string;
  /** Skal allerede være normaliseret af kalderen. */
  url: string;
  source: string;
  /** Kildens eget udgivelsestidspunkt (ISO 8601). */
  publishedAt?: string;
};

function tilFields(m: MentionRække, medPublishedAt: boolean): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    CustomerEmail: m.customerEmail,
    Title: m.title,
    URL: m.url,
    Source: m.source,
    // FoundAt = hvornår VI fandt det. PublishedAt = hvornår kilden udgav det.
    // De to er ikke det samme, og det er forskellen, der afgør om et fund er nyt.
    FoundAt: new Date().toISOString(),
  };
  if (medPublishedAt && m.publishedAt) fields.PublishedAt = m.publishedAt;
  return fields;
}

/**
 * Er PublishedAt-kolonnen til stede i Airtable?
 *
 * Den gamle fejl i loggen — "Kunne ikke gemme mention:" — skyldtes med stor
 * sandsynlighed, at koden skrev til en kolonne, der ikke fandtes i basen.
 * Airtable afviser i så fald HELE rækken med status 422, og omtalen gik tabt.
 *
 * I stedet for at vælte kørslen slås kolonnen fra efter første afvisning, og
 * der skrives en tydelig besked i loggen om, hvad der skal rettes i Airtable.
 * Resten af kørslen fortsætter — uden udgivelsesdato, men med omtalen gemt.
 */
let publishedAtVirker = true;

export async function saveMentions(rækker: MentionRække[]): Promise<number> {
  if (rækker.length === 0) return 0;

  const baseId = process.env.AIRTABLE_BASE_ID;
  let gemt = 0;

  // Airtable tager op til 10 rækker pr. kald. Det er både hurtigere og
  // mildere ved kaldgrænsen end én ad gangen.
  for (let i = 0; i < rækker.length; i += 10) {
    const gruppe = rækker.slice(i, i + 10);

    const send = async (medPublishedAt: boolean): Promise<Response> => {
      await pace();
      return fetch(`${BASE_URL}/${baseId}/Mentions`, {
        method: "POST",
        headers: airtableHeaders(),
        body: JSON.stringify({
          records: gruppe.map((m) => ({ fields: tilFields(m, medPublishedAt) })),
        }),
      });
    };

    let res = await send(publishedAtVirker);

    if (!res.ok && res.status === 422 && publishedAtVirker) {
      const detaljer = await res.clone().text();
      if (detaljer.includes("PublishedAt") || detaljer.includes("UNKNOWN_FIELD_NAME")) {
        console.error(
          "[airtable] Kolonnen 'PublishedAt' ser ikke ud til at findes i tabellen " +
            "Mentions. Omtalerne gemmes uden udgivelsesdato resten af kørslen. " +
            "Opret kolonnen i Airtable (felttype: Date, med tid) for at slippe for dette."
        );
        publishedAtVirker = false;
        res = await send(false);
      }
    }

    if (!res.ok) {
      // Kun DENNE gruppe fejler. Resten af omtalerne forsøges stadig, så en
      // enkelt dårlig række ikke koster kunden alle dagens fund.
      console.error(`[airtable] Kunne ikke gemme ${gruppe.length} omtale(r): ${await beskrivFejl(res)}`);
      continue;
    }

    gemt += gruppe.length;
  }

  return gemt;
}

// ---------------------------------------------------------------------------
// ScanRuns — hvornår kørte scannet sidst med succes?
// ---------------------------------------------------------------------------

/**
 * Bruges til at lukke hullet mellem to cron-kørsler.
 *
 * Vercels Hobby-plan udløser ikke jobbet på et fast minuttal, så to kørsler
 * kan ligge mere end 24 timer fra hinanden. Ved at huske sidste vellykkede
 * kørsel kan vinduet strækkes præcis så langt, der faktisk er gået.
 *
 * Tabellen er FRIVILLIG. Findes den ikke, falder scannet tilbage til det
 * normale 24-timers-vindue og skriver én linje i loggen om det. Det er med
 * vilje: en manglende hjælpetabel må ikke kunne stoppe overvågningen.
 */
const SCAN_RUNS_TABEL = "ScanRuns";

let scanRunsFindes: boolean | null = null;

export async function getLastSuccessfulRun(): Promise<Date | null> {
  const baseId = process.env.AIRTABLE_BASE_ID;

  const params = new URLSearchParams();
  params.set("filterByFormula", `{Status}="ok"`);
  params.set("pageSize", "1");
  params.append("sort[0][field]", "RunAt");
  params.append("sort[0][direction]", "desc");
  params.append("fields[]", "RunAt");

  try {
    const res = await fetch(`${BASE_URL}/${baseId}/${SCAN_RUNS_TABEL}?${params.toString()}`, {
      headers: airtableHeaders(),
      cache: "no-store",
    });

    if (res.status === 404) {
      scanRunsFindes = false;
      console.warn(
        `[airtable] Tabellen "${SCAN_RUNS_TABEL}" findes ikke. Scannet bruger det ` +
          "normale 24-timers-vindue. Opret tabellen for at lukke hullet mellem kørsler."
      );
      return null;
    }

    if (!res.ok) {
      console.error(`[airtable] Kunne ikke læse ${SCAN_RUNS_TABEL}: ${await beskrivFejl(res)}`);
      return null;
    }

    scanRunsFindes = true;
    const data = await res.json();
    const rå = data.records?.[0]?.fields?.RunAt;
    if (!rå) return null;

    const dato = new Date(String(rå));
    return Number.isNaN(dato.getTime()) ? null : dato;
  } catch (err) {
    console.error(`[airtable] Kunne ikke læse ${SCAN_RUNS_TABEL}:`, err);
    return null;
  }
}

export async function recordRun(opts: {
  runAt: Date;
  status: "ok" | "fejl";
  note: string;
}): Promise<void> {
  if (scanRunsFindes === false) return;

  const baseId = process.env.AIRTABLE_BASE_ID;

  try {
    await pace();
    const res = await fetch(`${BASE_URL}/${baseId}/${SCAN_RUNS_TABEL}`, {
      method: "POST",
      headers: airtableHeaders(),
      body: JSON.stringify({
        fields: {
          RunAt: opts.runAt.toISOString(),
          Status: opts.status,
          Note: opts.note.slice(0, 900),
        },
      }),
    });

    if (res.status === 404) {
      scanRunsFindes = false;
      return;
    }
    if (!res.ok) {
      console.error(`[airtable] Kunne ikke skrive ${SCAN_RUNS_TABEL}: ${await beskrivFejl(res)}`);
    }
  } catch (err) {
    console.error(`[airtable] Kunne ikke skrive ${SCAN_RUNS_TABEL}:`, err);
  }
}
