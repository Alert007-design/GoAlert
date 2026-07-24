import { FoundItem } from "./sources";
import {
  alertWithResultsEmail,
  alertNoResultsEmail,
  EnrichedFoundItem,
} from "../../_lib/email-templates";
import { sendViaResend } from "../../_lib/resend";

// NB: importstierne herover antager, at denne fil ligger i app/api/cron/scan/.
// Tilpas "../../_lib/..." hvis jeres faktiske mappestruktur er en anden.

export async function sendAlertEmail(
  toEmail: string,
  customerName: string,
  keywords: string[],
  itemsByKeyword: Record<string, FoundItem[]>
) {
  const payload = alertWithResultsEmail({
    recipientEmail: toEmail,
    customerName: customerName || undefined,
    keywords,
    itemsByKeyword: itemsByKeyword as Record<string, EnrichedFoundItem[]>,
  });

  await sendViaResend({
    to: toEmail,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}

// Sendes når scanningen er gennemført, men intet nyt er fundet for nogen af
// kundens søgeord. sourceIssues bruges til at fortælle, hvis en kilde reelt
// fejlede teknisk, så det ikke fremstår som om overvågningen bare ikke fandt
// noget.
export async function sendNoResultsEmail(
  toEmail: string,
  customerName: string,
  keywords: string[],
  sourceIssues?: string[]
) {
  const payload = alertNoResultsEmail({
    recipientEmail: toEmail,
    customerName: customerName || undefined,
    keywords,
    sourceIssues,
  });

  await sendViaResend({
    to: toEmail,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}
