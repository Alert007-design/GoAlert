// Fælles funktion til at sende e-mails via Resend.
// Erstatter de tidligere tre kopier af "sendEmail" i signup/route.ts,
// webhooks/stripe/route.ts og cron/scan/email.ts.

export async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    console.error(
      "Resend er ikke konfigureret (RESEND_API_KEY eller RESEND_FROM mangler)."
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      console.error("Resend-fejl:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Kunne ikke sende e-mail via Resend:", err);
    return false;
  }
}
