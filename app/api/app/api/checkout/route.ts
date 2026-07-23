import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const PRICE_BY_KEYWORD_COUNT: Record<number, string | undefined> = {
  2: process.env.STRIPE_PRICE_2KW,
  3: process.env.STRIPE_PRICE_3KW,
  4: process.env.STRIPE_PRICE_4KW,
  5: process.env.STRIPE_PRICE_5KW,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (keywords.length < 2 || keywords.length > 5) {
    return NextResponse.json(
      { error: "2-5 søgeord er påkrævet for betalingsflowet." },
      { status: 400 }
    );
  }

  const priceId = PRICE_BY_KEYWORD_COUNT[keywords.length];
  if (!priceId) {
    return NextResponse.json(
      { error: `Ingen pris konfigureret for ${keywords.length} søgeord.` },
      { status: 500 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://gossipalert.dk";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancelled`,
      metadata: {
        email,
        keywords: JSON.stringify(keywords),
        keywordCount: String(keywords.length),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout-fejl:", err);
    return NextResponse.json(
      { error: "Kunne ikke oprette betaling." },
      { status: 500 }
    );
  }
}
