import { FoundItem } from "./sources";

export async function sendAlertEmail(
  toEmail: string,
  customerName: string,
  keyword: string,
  items: FoundItem[]
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY mangler — kan ikke sende e-mail.");
    return;
  }

  const fromAddress = process.env.RESEND_FROM || "Gossip Alert <onboarding@resend.dev>";

  const listHtml = items
    .map(
      (i) =>
        `<li><a href="${i.url}">${i.title}</a> — <span style="color:#888">${i.source}</span></li>`
    )
    .join("");

  const html = `
    <div style="font-family: sans-serif; max-width: 560px;">
      <h2>Ny omtale af "${keyword}"</h2>
      <p>Hej ${customerName || ""},</p>
      <p>Gossip Alert har fundet ${items.length} ny(e) omtale(r):</p>
      <ul>${listHtml}</ul>
      <p style="color:#888; font-size: 13px;">Du får denne besked, fordi du overvåger "${keyword}" med Gossip Alert.</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [toEmail],
      subject: `Gossip Alert: ny omtale af "${keyword}"`,
      html,
    }),
  });

  if (!res.ok) {
    console.error("Resend-fejl:", res.status, await res.text());
  }
}
