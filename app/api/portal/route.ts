import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../_lib/stripe";
import { paymentsEnabled } from "../_lib/features";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Kundeportalen hører til betalingsfunktionen. Er den fra, kontaktes
  // Stripe ikke, og der slås ikke op i Airtable.
  if (!paymentsEnabled()) {
    return NextResponse.json(
      {
        error: "BETALING_IKKE_AKTIV",
        message: "Abonnementsfunktionen er ikke aktiv.",
      },
      { status: 503 }
    );
  }

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
  if (!token || !baseId) {
    console.error("Airtable er ikke konfigureret (mangler env-variabler).");
    return NextResponse.json({ error: "Der opstod en fejl. Prøv igen senere." }, { status: 500 });
  }

  try {
    const searchUrl = `https://api.airtable.com/v0/${baseId}/Customers?filterByFormula=${encodeURIComponent(
      `{Email}='${email.replace(/'/g, "\\'")}'`
    )}`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchData = await searchRes.json();
    const record = searchData.records?.[0];
    const stripeCustomerId = record?.fields?.StripeCustomerId as string | undefined;

    if (!stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "Vi kunne ikke finde et betalt abonnement på denne e-mail. Har du kun det gratis søgeord, er der intet abonnement at administrere.",
        },
        { status: 404 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gossipalert.dk";
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${siteUrl}/`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("Portal-fejl:", err);
    return NextResponse.json(
      { error: "Der opstod en fejl. Prøv igen senere." },
      { status: 500 }
    );
  }
}
