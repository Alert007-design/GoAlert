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
      (i) => `
        <tr>
          <td style="padding: 14px 0; border-bottom: 1px solid #1f2937;">
            <a href="${i.url}" style="color: #f5f5f4; text-decoration: none; font-size: 15px; font-weight: 600; line-height: 1.4;">
              ${i.title}
            </a>
            <div style="color: #f59e0b; font-size: 12px; letter-spacing: 0.03em; text-transform: uppercase; margin-top: 4px;">
              ${i.source}
            </div>
          </td>
        </tr>
      `
    )
    .join("");

  const html = `
  <!DOCTYPE html>
  <html>
    <body style="margin:0; padding:0; background-color:#0b0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0f17; padding: 32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" style="max-width: 560px; background-color:#111827; border-radius: 12px; overflow: hidden; border: 1px solid #1f2937;">

              <!-- Header -->
              <tr>
                <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #1f2937;">
                  <span style="font-size: 20px; font-weight: 700; color: #f5f5f4;">Gossip</span><span style="font-size: 20px; font-weight: 700; color: #f59e0b;">Alert</span>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 28px 32px 8px 32px;">
                  <div style="color:#f59e0b; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 12px;">
                    Early-warning for dit omdømme
                  </div>
                  <h1 style="color:#f5f5f4; font-size: 24px; line-height: 1.3; margin: 0 0 16px 0; font-weight: 700;">
                    Ny omtale af &quot;${keyword}&quot;
                  </h1>
                  <p style="color:#9ca3af; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">
                    Hej ${customerName || ""}, Gossip Alert har fundet ${items.length} ny(e) omtale(r), der matcher dit søgeord:
                  </p>
                </td>
              </tr>

              <!-- List -->
              <tr>
                <td style="padding: 0 32px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${listHtml}
                  </table>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td style="padding: 28px 32px 8px 32px;">
                  <a href="https://gossipalert.dk" style="display:inline-block; background-color:#f59e0b; color:#0b0f17; font-weight:700; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration:none;">
                    Se alle omtaler
                  </a>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 24px 32px 32px 32px;">
                  <p style="color:#6b7280; font-size: 12px; line-height: 1.5; margin: 0;">
                    Du får denne besked, fordi du overvåger &quot;${keyword}&quot; med Gossip Alert.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
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
