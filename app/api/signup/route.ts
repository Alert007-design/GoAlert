import { NextRequest, NextResponse } from "next/server";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.error("Resend er ikke konfigureret (mangler env-variabler).");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("Resend-fejl (signup-mail):", res.status, await res.text());
    }
  } catch (err) {
    console.error("Kunne ikke sende e-mail fra signup:", err);
  }
}

function welcomeEmailHtml() {
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #111;">
      <h2>Velkommen til Gossip Alert!</h2>
      <p>Hej,</p>
      <p>Tak fordi du er blevet kunde hos Gossip Alert. Vi glæder os til samarbejdet og håber, du bliver glad for din daglige overvågning.</p>
      <p>Fra nu af holder vi øje med nettet for dig, og du hører fra os, så snart der sker noget relevant.</p>
      <p>Mange hilsner,<br>Gossip Alert-teamet</p>
    </div>
  `;
}

export async function POST(req: NextRequest) {
  let body: { email?: string; keywords?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }
  const email = (body.email || "").trim();
  const keywords = (body.keywords || []).map((k) => k.trim()).filter(Boolean);
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Indtast en gyldig e-mailadresse." },
      { status: 400 }
    );
  }
  if (keywords.length !== 1) {
    return NextResponse.json(
      { error: "Denne route håndterer kun ét gratis søgeord. Brug /api/checkout for flere." },
      { status: 400 }
    );
  }
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const signupsTable = process.env.AIRTABLE_TABLE_NAME || "Signups";
  if (!token || !baseId) {
    console.error("Airtable er ikke konfigureret (mangler env-variabler).");
    return NextResponse.json(
      { error: "Der opstod en fejl. Prøv igen senere." },
      { status: 500 }
    );
  }

  // 0. Tjek om e-mailen allerede er kunde — gratis tilmelding er kun for nye kunder.
  try {
    const searchUrl = `https://api.airtable.com/v0/${baseId}/Customers?filterByFormula=${encodeURIComponent(
      `{Email}='${email.replace(/'/g, "\\'")}'`
    )}`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchData = await searchRes.json();
    if (searchData.records?.length > 0) {
      return NextResponse.json(
        {
          error:
            "UPGRADE_REQUIRED",
          message:
            "Du er allerede tilmeldt. Yderligere søgeord er kun for betalende kunder — vælg antal søgeord nedenfor for at opgradere dit abonnement.",
        },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("Kunne ikke tjekke eksisterende kunde:", err);
  }

  // 1. Log tilmeldingen i Signups (som hidtil, til statistik/historik).
  try {
    const signupRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(signupsTable)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { Email: email } }),
      }
    );
    if (!signupRes.ok) {
      console.error("Airtable-fejl (Signups):", signupRes.status, await signupRes.text());
    }
  } catch (err) {
    console.error("Kunne ikke kontakte Airtable (Signups):", err);
  }
  // 2. Opret kunden direkte i Customers med det ene gratis søgeord.
  try {
    const customerRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/Customers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            Name: "",
            Email: email,
            Keywords: keywords[0],
            Active: true,
          },
        }),
      }
    );
    if (!customerRes.ok) {
      const errText = await customerRes.text();
      console.error("Airtable-fejl (Customers):", customerRes.status, errText);
      return NextResponse.json(
        { error: "Der opstod en fejl. Prøv igen senere." },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("Kunne ikke kontakte Airtable (Customers):", err);
    return NextResponse.json(
      { error: "Der opstod en fejl. Prøv igen senere." },
      { status: 502 }
    );
  }

  // 3. Send velkomstmail.
  await sendEmail(email, "Velkommen til Gossip Alert", welcomeEmailHtml());

  return NextResponse.json({ ok: true });
}
