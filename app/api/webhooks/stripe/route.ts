import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

async function findCustomerRecord(
  baseId: string,
  token: string,
  field: "Email" | "StripeSubscriptionId" | "StripeCustomerId",
  value: string
) {
  const url = `https://api.airtable.com/v0/${baseId}/Customers?filterByFormula=${encodeURIComponent(
    `{${field}}='${value.replace(/'/g, "\\'")}'`
  )}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.records?.[0];
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Mangler signatur." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook-signatur-fejl:", err);
    return NextResponse.json({ error: "Ugyldig signatur." }, { status: 400 });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    console.error("Airtable er ikke konfigureret (mangler env-variabler).");
    return NextResponse.json({ received: true });
  }

  // --- Gennemført betaling: opret/opdater kunden med søgeord og aktiv status ---
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const email = session.metadata?.email || session.customer_email || "";
    const keywordsRaw = session.metadata?.keywords;
    const keywords: string[] = keywordsRaw ? JSON.parse(keywordsRaw) : [];
    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id || "";
    const stripeSubscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || "";

    if (!email || keywords.length === 0) {
      console.error("Webhook: mangler email eller keywords i metadata", session.id);
      return NextResponse.json({ received: true });
    }

    try {
      const existing = await findCustomerRecord(baseId, token, "Email", email);

      const fields = {
        Email: email,
        Keywords: keywords.join(", "),
        Active: true,
        StripeCustomerId: stripeCustomerId,
        StripeSubscriptionId: stripeSubscriptionId,
      };

      if (existing) {
        const updateRes = await fetch(
          `https://api.airtable.com/v0/${baseId}/Customers/${existing.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fields }),
          }
        );
        if (!updateRes.ok) {
          console.error(
            "Airtable-fejl (opdater kunde):",
            updateRes.status,
            await updateRes.text()
          );
        }
      } else {
        const createRes = await fetch(`https://api.airtable.com/v0/${baseId}/Customers`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields: { Name: "", ...fields } }),
        });
        if (!createRes.ok) {
          console.error(
            "Airtable-fejl (opret kunde):",
            createRes.status,
            await createRes.text()
          );
        }
      }
    } catch (err) {
      console.error("Kunne ikke opdatere Airtable fra webhook (checkout):", err);
    }
  }

  // --- Abonnement opsagt/afsluttet: sæt kunden til inaktiv ---
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeSubscriptionId = subscription.id;
    const stripeCustomerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id || "";

    try {
      let existing = await findCustomerRecord(
        baseId,
        token,
        "StripeSubscriptionId",
        stripeSubscriptionId
      );

      if (!existing && stripeCustomerId) {
        existing = await findCustomerRecord(baseId, token, "StripeCustomerId", stripeCustomerId);
      }

      if (existing) {
        const updateRes = await fetch(
          `https://api.airtable.com/v0/${baseId}/Customers/${existing.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fields: { Active: false } }),
          }
        );
        if (!updateRes.ok) {
          console.error(
            "Airtable-fejl (opsigelse):",
            updateRes.status,
            await updateRes.text()
          );
        }
      } else {
        console.error(
          "Webhook: kunne ikke finde kunde til opsigelse",
          stripeSubscriptionId
        );
      }
    } catch (err) {
      console.error("Kunne ikke opdatere Airtable fra webhook (opsigelse):", err);
    }
  }

  return NextResponse.json({ received: true });
}
