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
  keyword: string,
  items: FoundItem[]
) {
  const payload = alertWithResultsEmail({
    recipientEmail: toEmail,
    customerName: customerName || undefined,
    keyword,
    items: items as EnrichedFoundItem[],
  });

  await sendViaResend({
    to: toEmail,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}

// Ny: sendes når scanningen er gennemført, men intet nyt er fundet.
// sourceIssues bruges til at fortælle, hvis en kilde reelt fejlede teknisk,
// så det ikke fremstår som om overvågningen bare ikke fandt noget.
export async function sendNoResultsEmail(
  toEmail: string,
  customerName: string,
  keyword: string,
  sourceIssues?: string[]
) {
  const payload = alertNoResultsEmail({
    recipientEmail: toEmail,
    customerName: customerName || undefined,
    keyword,
    sourceIssues,
  });

  await sendViaResend({
    to: toEmail,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}
