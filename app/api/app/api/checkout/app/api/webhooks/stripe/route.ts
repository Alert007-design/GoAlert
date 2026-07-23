import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

async function createCustomerRow(fields: {
  Name: string;
  Email: string;
  Keyword: string;
  Active: boolean;
  StripeSubscriptionId?: string;
}) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/Customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    console.error("Airtable-fejl (Customers, webhook):", res.status, await res.text());
  }
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
  } catch (err) {
    console.error("Webhook-signaturfejl:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.metadata?.email;
    const keywordsJson = session.metadata?.keywords;
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

    if (email && keywordsJson) {
      const keywordList: string[] = JSON.parse(keywordsJson);
      for (const keyword of keywordList) {
        await createCustomerRow({
          Name: "",
          Email: email,
          Keyword: keyword,
          Active: true,
          StripeSubscriptionId: subscriptionId || "",
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
