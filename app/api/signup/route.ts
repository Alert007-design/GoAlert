import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { email?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }

  const email = (body.email || "").trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Indtast en gyldig e-mailadresse." },
      { status: 400 }
    );
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || "Signups";

  if (!token || !baseId) {
    console.error("Airtable er ikke konfigureret (mangler env-variabler).");
    return NextResponse.json(
      { error: "Der opstod en fejl. Prøv igen senere." },
      { status: 500 }
    );
  }

  try {
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: { Email: email },
        }),
      }
    );

    if (!airtableRes.ok) {
      const errText = await airtableRes.text();
      console.error("Airtable-fejl:", airtableRes.status, errText);
      return NextResponse.json(
        { error: "Der opstod en fejl. Prøv igen senere." },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("Kunne ikke kontakte Airtable:", err);
    return NextResponse.json(
      { error: "Der opstod en fejl. Prøv igen senere." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
