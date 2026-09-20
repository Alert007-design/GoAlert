import {
  alertWithResultsEmail,
  alertNoResultsEmail,
  EnrichedFoundItem,
} from "../../_lib/email-templates";
import { sendViaResend } from "../../_lib/resend";
import type { GroupedItem } from "./grouping";

// Begge funktioner her returnerer, om mailen rent faktisk blev sendt.
//
// Det er ikke en detalje. Tidligere blev svaret kasseret, så en fejlet
// afsendelse så ud som en succes — og omtalerne var allerede markeret som
// set. Kunden fik dem aldrig. Nu afgør returværdien, om de gemmes.

function tilMailPunkt(gruppe: GroupedItem): EnrichedFoundItem {
  return {
    title: gruppe.primary.title,
    url: gruppe.primary.url,
    source: gruppe.primary.source,
    publishedAt: gruppe.primary.publishedAt,
    excerpt: gruppe.primary.excerpt,
    alsoIn: gruppe.alsoIn.length > 0 ? gruppe.alsoIn : undefined,
  };
}

export async function sendAlertEmail(
  toEmail: string,
  customerName: string,
  keywords: string[],
  grupperEfterSøgeord: Record<string, GroupedItem[]>,
  sourceIssues?: string[]
): Promise<boolean> {
  const itemsByKeyword: Record<string, EnrichedFoundItem[]> = {};
  for (const [keyword, grupper] of Object.entries(grupperEfterSøgeord)) {
    itemsByKeyword[keyword] = grupper.map(tilMailPunkt);
  }

  const payload = alertWithResultsEmail({
    recipientEmail: toEmail,
    customerName: customerName || undefined,
    keywords,
    itemsByKeyword,
    sourceIssues,
  });

  return sendViaResend({
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
): Promise<boolean> {
  const payload = alertNoResultsEmail({
    recipientEmail: toEmail,
    customerName: customerName || undefined,
    keywords,
    sourceIssues,
  });

  return sendViaResend({
    to: toEmail,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}
