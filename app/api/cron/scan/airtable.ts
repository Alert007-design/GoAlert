const BASE_URL = "https://api.airtable.com/v0";

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
  keyword: string;
};

export async function getActiveCustomers(): Promise<Customer[]> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const url = `${BASE_URL}/${baseId}/Customers?filterByFormula=${encodeURIComponent(
    "{Active}=1"
  )}`;
  const res = await fetch(url, { headers: airtableHeaders() });
  if (!res.ok) {
    throw new Error(`Airtable Customers-fejl: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return (data.records || [])
    .map((r: any) => ({
      id: r.id,
      name: r.fields.Name || "",
      email: r.fields.Email || "",
      // Feltet hedder "Keywords" (flertal) i Airtable i dag, ikke "Keyword" —
      // den tidligere kode læste det forkerte feltnavn, hvilket gjorde denne
      // værdi altid tom og filtrerede samtlige kunder væk nedenfor.
      keyword: r.fields.Keywords || "",
    }))
    .filter((c: Customer) => c.email && c.keyword);
}

export async function getKnownUrls(customerEmail: string): Promise<Set<string>> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const formula = `{CustomerEmail}="${customerEmail.replace(/"/g, '\\"')}"`;
  const url = `${BASE_URL}/${baseId}/Mentions?filterByFormula=${encodeURIComponent(
    formula
  )}&fields%5B%5D=URL`;
  const res = await fetch(url, { headers: airtableHeaders() });
  if (!res.ok) {
    throw new Error(`Airtable Mentions-fejl: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const urls = (data.records || []).map((r: any) => r.fields.URL).filter(Boolean);
  return new Set(urls);
}

export async function saveMention(mention: {
  customerEmail: string;
  title: string;
  url: string;
  source: string;
}) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const res = await fetch(`${BASE_URL}/${baseId}/Mentions`, {
    method: "POST",
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        CustomerEmail: mention.customerEmail,
        Title: mention.title,
        URL: mention.url,
        Source: mention.source,
        FoundAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Kunne ikke gemme mention: ${res.status} ${await res.text()}`);
  }
}
