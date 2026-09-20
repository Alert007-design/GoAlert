import { NextRequest, NextResponse } from "next/server";
import { welcomeEmail } from "../_lib/email-templates";
import { sendViaResend } from "../_lib/resend";
import {
  paymentsEnabled,
  signupsEnabled,
  MAX_SØGEORD_UDEN_BETALING,
} from "../_lib/features";

// NB: importstierne herover antager, at denne fil ligger i app/api/signup/.
// Tilpas "../_lib/..." hvis jeres faktiske mappestruktur er en anden.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Er tilmelding lukket, oprettes ingen i Airtable, og der sendes ingen mail.
  // Det står først i funktionen, så en lukket formular ikke kan omgås ved at
  // kalde ruten direkte.
  if (!signupsEnabled()) {
    return NextResponse.json(
      {
        error: "TILMELDING_LUKKET",
        message: "Gossip Alert tager ikke imod nye tilmeldinger lige nu.",
      },
      { status: 503 }
    );
  }

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
  // Med betaling slået fra er der ingen grund til at begrænse til ét søgeord —
  // der er ikke noget at opgradere til. Er betaling slået til igen, gælder den
  // gamle regel: ét gratis søgeord her, flere gennem /api/checkout.
  const maxSøgeord = paymentsEnabled() ? 1 : MAX_SØGEORD_UDEN_BETALING;

  if (keywords.length < 1 || keywords.length > maxSøgeord) {
    return NextResponse.json(
      {
        error:
          maxSøgeord === 1
            ? "Denne route håndterer kun ét gratis søgeord. Brug /api/checkout for flere."
            : `Angiv mellem 1 og ${maxSøgeord} søgeord.`,
      },
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
          error: paymentsEnabled() ? "UPGRADE_REQUIRED" : "ALLEREDE_TILMELDT",
          message: paymentsEnabled()
            ? "Du er allerede tilmeldt. Yderligere søgeord er kun for betalende kunder — vælg antal søgeord nedenfor for at opgradere dit abonnement."
            : "Denne e-mail er allerede tilmeldt.",
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
            // Alle søgeord gemmes kommasepareret — scannet splitter dem igen.
            Keywords: keywords.join(", "),
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

  // 3. Send velkomstmail (fælles skabelon, matcher sitets design).
  const mail = welcomeEmail({ recipientEmail: email, keywords });
  await sendViaResend({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  return NextResponse.json({ ok: true });
}
