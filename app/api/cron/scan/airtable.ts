const BASE_URL = "https://api.airtable.com/v0";

/**
 * Hvor langt tilbage vi slår op efter allerede kendte URL'er.
 *
 * Et fund kan kun accepteres, hvis det er udgivet inden for de sidste 24 timer.
 * Derfor kan den samme URL højst dukke op igen ca. et døgn efter, vi først så
 * den — alt ældre end det er dødvægt, som bare gør opslaget langsommere.
 * 14 dage er rigelig margin.
 */
const DEDUP_WINDOW_DAYS = Number(process.env.DEDUP_WINDOW_DAYS || 14);

function airtableHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
    "Content-Type": "application/json",
  };
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
    throw new Error(`Airtable Customers-fejl: ${res.status} ${await res.text()}`);
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
 * Henter kendte URL'er for en kunde inden for dedup-vinduet.
 *
 * To ting er vigtige her:
 *
 * 1. Airtable returnerer højst 100 rækker pr. kald og lægger en "offset" i
 *    svaret, hvis der er flere. Uden at følge den offset så vi kun de første
 *    100 kendte URL'er — resten blev betragtet som nye og rapporteret igen.
 *
 * 2. Rækker uden FoundAt tages altid med. Hellere hente lidt for meget end at
 *    tabe en kendt URL og sende en dublet til kunden.
 */
export async function getKnownUrls(customerEmail: string): Promise<Set<string>> {
  const baseId = process.env.AIRTABLE_BASE_ID;

  const escapedEmail = customerEmail.replace(/"/g, '\\"');
  const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const sinceDay = since.toISOString().slice(0, 10); // YYYY-MM-DD

  const formula =
    `AND(` +
    `{CustomerEmail}="${escapedEmail}",` +
    `OR({FoundAt}=BLANK(),IS_AFTER({FoundAt},DATETIME_PARSE("${sinceDay}","YYYY-MM-DD")))` +
    `)`;

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
      throw new Error(`Airtable Mentions-fejl: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    for (const record of data.records || []) {
      const recordUrl = record?.fields?.URL;
      if (recordUrl) urls.add(recordUrl);
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
    `[airtable] ${customerEmail}: ${urls.size} kendte URL'er siden ${sinceDay} (${pages} side(r))`
  );

  return urls;
}

export async function saveMention(mention: {
  customerEmail: string;
  title: string;
  url: string;
  source: string;
  /** Kildens eget udgivelsestidspunkt (ISO 8601). */
  publishedAt?: string;
}) {
  const baseId = process.env.AIRTABLE_BASE_ID;

  const fields: Record<string, unknown> = {
    CustomerEmail: mention.customerEmail,
    Title: mention.title,
    URL: mention.url,
    Source: mention.source,
    // FoundAt = hvornår VI fandt det. PublishedAt = hvornår kilden udgav det.
    // De to er ikke det samme, og det er forskellen, der afgør om et fund er nyt.
    FoundAt: new Date().toISOString(),
  };

  if (mention.publishedAt) {
    fields.PublishedAt = mention.publishedAt;
  }

  const res = await fetch(`${BASE_URL}/${baseId}/Mentions`, {
    method: "POST",
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    throw new Error(`Kunne ikke gemme mention: ${res.status} ${await res.text()}`);
  }
}
