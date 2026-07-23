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
      console.error("Resend-fejl (webhook-mail):", res.status, await res.text());
    }
  } catch (err) {
    console.error("Kunne ikke sende e-mail fra webhook:", err);
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

function goodbyeEmailHtml() {
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #111;">
      <h2>Tak for samarbejdet</h2>
      <p>Hej,</p>
      <p>Dit abonnement hos Gossip Alert er nu opsagt. Tak for den tid vi har haft sammen — vi håber du er velkommen tilbage, hvis du på et tidspunkt får brug for overvågning igen.</p>
      <p>Mange hilsner,<br>Gossip Alert-teamet</p>
    </div>
  `;
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
        // Eksisterende kunde (fx opgraderer antal søgeord) — ingen ny velkomstmail.
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
        } else {
          // Ny kunde — send velkomstmail.
          await sendEmail(email, "Velkommen til Gossip Alert", welcomeEmailHtml());
        }
      }
    } catch (err) {
      console.error("Kunne ikke opdatere Airtable fra webhook (checkout):", err);
    }
  }

  // --- Abonnement opsagt/afsluttet: sæt kunden til inaktiv og send opsigelsesmail ---
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
        } else {
          const customerEmail = existing.fields?.Email;
          if (customerEmail) {
            await sendEmail(customerEmail, "Tak for samarbejdet", goodbyeEmailHtml());
          }
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
