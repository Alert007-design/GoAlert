// Fælles mail-skabeloner for Gossip Alert.
//
// Alle fire mail-typer (fund, intet fund, velkomst, opsigelse) bygges herfra,
// så design og struktur er ens. Farver er hentet direkte fra app/globals.css'
// CSS-variabler (--ink-950, --amber, osv.), men skrevet som faste hex-værdier
// og inline styles, da mailklienter (særligt Outlook) hverken understøtter
// CSS-variabler eller <style>-blokke pålideligt.
//
// Fontvalg: sitets Fraunces/Inter/IBM Plex Mono kan ikke indlæses i de fleste
// mailklienter (Gmail og Outlook understøtter ikke @font-face i praksis), så
// her bruges sikre fallback-stakke, der matcher den samme karakter:
//   - Fraunces (serif, overskrifter)      -> Georgia/Times New Roman/serif
//   - Inter (sans, brødtekst)             -> system sans-serif-stak
//   - IBM Plex Mono (mono, labels/knapper)-> Courier New/monospace

import type { FoundItem } from "../cron/scan/sources";

// NB: importstien herover antager, at sources.ts ligger i app/api/cron/scan/.
// Tilpas stien, hvis jeres faktiske mappestruktur er en anden.

// FoundItem udvides lokalt med felter, som resultat-kortet gerne vil vise,
// men som det nuværende scan-system (sources.ts) ikke leverer endnu:
// publiceringsdato, resumé, kildetype og billede. Skabelonen viser dem,
// hvis de findes, og springer dem elegant over, hvis ikke.
export interface EnrichedFoundItem extends FoundItem {
  publishedAt?: string;
  excerpt?: string;
  type?: string; // fx "Nyhed", "Myndighedsdokument", "Video", "Podcast", "Debatindlæg"
  imageUrl?: string;
}

const SITE_URL = "https://gossipalert.dk";
const MANAGE_URL = `${SITE_URL}/administrer`;

const FONT_DISPLAY = "Georgia, 'Times New Roman', serif";
const FONT_BODY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const FONT_MONO = "'Courier New', Courier, monospace";

// ---------- sikkerhed / hjælpefunktioner ----------

// Al dynamisk tekst (titler, kilder, søgeord osv. fra scannede sider eller
// brugerinput) skal HTML-escapes, før den sættes ind i mailen. Ellers kan en
// ondsindet eller uheldigt formateret kilde-titel injicere HTML i mailen.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Fremhæver søgeordet i en allerede HTML-escapet tekst.
function highlightKeyword(escapedText: string, keyword: string): string {
  const escapedKeyword = escapeHtml(keyword).trim();
  if (!escapedKeyword) return escapedText;
  try {
    const re = new RegExp(`(${escapeRegex(escapedKeyword)})`, "gi");
    return escapedText.replace(
      re,
      `<span style="background:#3a2f12; color:#f2a93b; padding:0 3px; border-radius:2px;">$1</span>`
    );
  } catch {
    return escapedText;
  }
}

function formatDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// Skjult preheader-tekst: vises som forhåndsvisning i indbakken (Gmail,
// Outlook m.fl.), men ikke i selve mailteksten.
function preheaderHtml(text: string): string {
  return `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; opacity:0;">${escapeHtml(
    text
  )}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`;
}

// ---------- fælles layout ----------

function emailLayout(opts: {
  preheader: string;
  bodyHtml: string;
  recipientEmail: string;
}): string {
  const { preheader, bodyHtml, recipientEmail } = opts;
  return `<!DOCTYPE html>
<html lang="da">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <title>Gossip Alert</title>
  </head>
  <body style="margin:0; padding:0; background-color:#0a0f1c; font-family:${FONT_BODY};">
    ${preheaderHtml(preheader)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f1c; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:580px; background-color:#11182b; border-radius:8px; border:1px solid #1b2338;">

            <!-- Header -->
            <tr>
              <td style="padding:26px 32px; border-bottom:1px solid #1b2338;">
                <span style="font-family:${FONT_DISPLAY}; font-size:20px; font-weight:600; color:#edeae2;">Gossip</span><span style="font-family:${FONT_DISPLAY}; font-size:20px; font-weight:600; color:#f2a93b;">Alert</span>
              </td>
            </tr>

            <!-- Indhold -->
            <tr>
              <td style="padding:32px;">
                ${bodyHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:24px 32px 32px 32px; border-top:1px solid #1b2338;">
                <p style="margin:0 0 10px; font-family:${FONT_MONO}; font-size:12px; color:#8a93a6;">
                  Sendt til ${escapeHtml(recipientEmail)}.
                  <a href="${MANAGE_URL}" style="color:#3abfad; text-decoration:underline;">Administrer din overvågning</a>
                </p>
                <p style="margin:0; font-family:${FONT_MONO}; font-size:12px; color:#8a93a6;">
                  Gossip Alert &middot; <a href="${SITE_URL}" style="color:#8a93a6;">gossipalert.dk</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ---------- resultatkort ----------

function typeBadgeHtml(type?: string): string {
  if (!type) return "";
  return `<span style="display:inline-block; font-family:${FONT_MONO}; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:#3abfad; border:1px solid rgba(58,191,173,0.35); border-radius:3px; padding:2px 7px; margin-left:8px;">${escapeHtml(
    type
  )}</span>`;
}

function renderResultCard(item: EnrichedFoundItem, keyword: string): string {
  const titleEscaped = highlightKeyword(escapeHtml(item.title), keyword);
  const sourceEscaped = escapeHtml(item.source);
  const dateLabel = formatDate(item.publishedAt);
  const excerptEscaped = item.excerpt
    ? highlightKeyword(escapeHtml(item.excerpt), keyword)
    : null;
  const thumbHtml = item.imageUrl
    ? `<img src="${item.imageUrl}" alt="" width="72" height="72" style="display:block; border-radius:6px; object-fit:cover; background:#1b2338;" />`
    : "";

  return `
  <tr>
    <td style="padding:18px 0; border-bottom:1px solid #1b2338;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${
            thumbHtml
              ? `<td width="72" valign="top" style="padding-right:14px;">${thumbHtml}</td>`
              : ""
          }
          <td valign="top">
            <div style="margin-bottom:6px;">
              <span style="font-family:${FONT_MONO}; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:#8a93a6;">${sourceEscaped}</span>
              ${
                dateLabel
                  ? `<span style="font-family:${FONT_MONO}; font-size:11px; color:#8a93a6;"> &middot; ${escapeHtml(
                      dateLabel
                    )}</span>`
                  : ""
              }
              ${typeBadgeHtml(item.type)}
            </div>
            <a href="${item.url}" style="color:#edeae2; text-decoration:none; font-size:15px; font-weight:600; line-height:1.4;">${titleEscaped}</a>
            ${
              excerptEscaped
                ? `<p style="margin:6px 0 0; color:#c7c3b8; font-size:13px; line-height:1.5;">${excerptEscaped}</p>`
                : ""
            }
            <div style="margin-top:10px;">
              <a href="${item.url}" style="display:inline-block; font-family:${FONT_MONO}; font-size:12px; color:#0a0f1c; background:#f2a93b; padding:7px 14px; border-radius:3px; text-decoration:none;">Læs historien</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ---------- offentlige skabelon-funktioner ----------

export interface EmailPayload {
  subject: string;
  html: string;
  text: string;
}

export function alertWithResultsEmail(opts: {
  recipientEmail: string;
  customerName?: string;
  keyword: string;
  items: EnrichedFoundItem[];
}): EmailPayload {
  const { recipientEmail, customerName, keyword, items } = opts;
  const keywordEscaped = escapeHtml(keyword);
  const greeting = customerName ? `Hej ${escapeHtml(customerName)},` : "Hej,";
  const count = items.length;
  const countLabel = `${count} ${pluralize(count, "ny", "nye")} ${pluralize(
    count,
    "omtale",
    "omtaler"
  )}`;

  const cardsHtml = items.map((item) => renderResultCard(item, keyword)).join("");

  const bodyHtml = `
    <div style="font-family:${FONT_MONO}; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#3abfad; margin:0 0 14px;">Early-warning for dit omdømme</div>
    <h1 style="font-family:${FONT_DISPLAY}; font-weight:600; font-size:22px; line-height:1.3; color:#edeae2; margin:0 0 14px;">
      ${countLabel} af &quot;${keywordEscaped}&quot;
    </h1>
    <p style="color:#c7c3b8; font-size:14px; line-height:1.6; margin:0 0 20px;">
      ${greeting} Gossip Alert har fundet ${countLabel.toLowerCase()}, der matcher dit søgeord. Se dem herunder.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${cardsHtml}
    </table>
    <div style="margin-top:24px;">
      <a href="${SITE_URL}" style="display:inline-block; font-family:${FONT_MONO}; font-size:13px; color:#0a0f1c; background:#f2a93b; padding:12px 22px; border-radius:3px; text-decoration:none; font-weight:600;">Se alle omtaler</a>
    </div>
  `;

  const text = [
    `${countLabel} af "${keyword}"`,
    "",
    `${greeting} Gossip Alert har fundet følgende:`,
    "",
    ...items.map(
      (i) =>
        `- ${i.title} (${i.source})${
          i.publishedAt ? `, ${formatDate(i.publishedAt)}` : ""
        }\n  ${i.url}`
    ),
    "",
    `Administrer din overvågning: ${MANAGE_URL}`,
  ].join("\n");

  return {
    subject: `Gossip Alert: ${countLabel} af "${keyword}"`,
    html: emailLayout({
      preheader: `${countLabel} af "${keyword}" fundet — se dem her.`,
      bodyHtml,
      recipientEmail,
    }),
    text,
  };
}

export function alertNoResultsEmail(opts: {
  recipientEmail: string;
  customerName?: string;
  keyword: string;
  // Udfyldes kun hvis en eller flere kilder reelt fejlede teknisk under scanningen
  // (adskilt fra "ingen fund", jf. kravet om ikke at forveksle de to situationer).
  sourceIssues?: string[];
}): EmailPayload {
  const { recipientEmail, customerName, keyword, sourceIssues } = opts;
  const keywordEscaped = escapeHtml(keyword);
  const greeting = customerName ? `Hej ${escapeHtml(customerName)},` : "Hej,";

  const issuesHtml =
    sourceIssues && sourceIssues.length > 0
      ? `
      <div style="margin-top:18px; padding:14px 16px; border:1px solid rgba(242,169,59,0.35); background:rgba(242,169,59,0.08); border-radius:4px;">
        <p style="margin:0; color:#c7c3b8; font-size:13px; line-height:1.5;">
          Bemærk: ${escapeHtml(
            sourceIssues.join(", ")
          )} kunne ikke tjekkes i denne omgang. Det er ikke en fejl i din overvågning — vi forsøger automatisk igen ved næste kørsel.
        </p>
      </div>`
      : "";

  const bodyHtml = `
    <div style="font-family:${FONT_MONO}; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#3abfad; margin:0 0 14px;">Early-warning for dit omdømme</div>
    <h1 style="font-family:${FONT_DISPLAY}; font-weight:600; font-size:22px; line-height:1.3; color:#edeae2; margin:0 0 14px;">
      Ingen nye omtaler af &quot;${keywordEscaped}&quot;
    </h1>
    <p style="color:#c7c3b8; font-size:14px; line-height:1.6; margin:0 0 8px;">
      ${greeting} Gossip Alert har gennemført dagens overvågning af &quot;${keywordEscaped}&quot; — der er ikke fundet nye relevante omtaler i denne omgang.
    </p>
    <p style="color:#8a93a6; font-size:13px; line-height:1.6; margin:0 0 8px;">
      Det er gode nyheder, og der er ikke noget, du behøver at gøre.
    </p>
    <p style="color:#c7c3b8; font-size:14px; line-height:1.6; margin:18px 0 0;">
      Vil du udvide overvågningen — fx med alternative stavemåder, dit fulde navn eller din virksomheds navn? Du kan tilføje flere søgeord når som helst.
    </p>
    ${issuesHtml}
    <div style="margin-top:22px;">
      <a href="${MANAGE_URL}" style="display:inline-block; font-family:${FONT_MONO}; font-size:13px; color:#0a0f1c; background:#f2a93b; padding:12px 22px; border-radius:3px; text-decoration:none; font-weight:600;">Rediger min overvågning</a>
    </div>
  `;

  const text = [
    `Ingen nye omtaler af "${keyword}"`,
    "",
    `${greeting} Gossip Alert har gennemført dagens overvågning af "${keyword}" — ingen nye relevante omtaler fundet.`,
    sourceIssues && sourceIssues.length > 0
      ? `Bemærk: ${sourceIssues.join(
          ", "
        )} kunne ikke tjekkes i denne omgang. Vi forsøger automatisk igen ved næste kørsel.`
      : "",
    "",
    `Rediger din overvågning: ${MANAGE_URL}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `Gossip Alert: ingen nye omtaler af "${keyword}" i dag`,
    html: emailLayout({
      preheader: `Ingen nye omtaler af "${keyword}" i dag. Overvågningen kører videre.`,
      bodyHtml,
      recipientEmail,
    }),
    text,
  };
}

export function welcomeEmail(opts: {
  recipientEmail: string;
  keywords?: string[];
}): EmailPayload {
  const { recipientEmail, keywords } = opts;
  const keywordList =
    keywords && keywords.length > 0 ? keywords.join(", ") : null;

  const bodyHtml = `
    <div style="font-family:${FONT_MONO}; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#3abfad; margin:0 0 14px;">Velkommen</div>
    <h1 style="font-family:${FONT_DISPLAY}; font-weight:600; font-size:22px; line-height:1.3; color:#edeae2; margin:0 0 14px;">
      Din overvågning er sat i gang
    </h1>
    <p style="color:#c7c3b8; font-size:14px; line-height:1.6; margin:0 0 14px;">
      Hej, og velkommen til Gossip Alert. Tak fordi du er blevet kunde hos os.
    </p>
    ${
      keywordList
        ? `<p style="color:#c7c3b8; font-size:14px; line-height:1.6; margin:0 0 14px;">Vi holder nu øje med: <strong style="color:#edeae2;">${escapeHtml(
            keywordList
          )}</strong>.</p>`
        : ""
    }
    <p style="color:#c7c3b8; font-size:14px; line-height:1.6; margin:0 0 20px;">
      Så snart vi finder noget relevant, får du besked med det samme. Finder vi intet, hører du også fra os — så du altid ved, at overvågningen kører.
    </p>
    <div style="margin-top:8px;">
      <a href="${MANAGE_URL}" style="display:inline-block; font-family:${FONT_MONO}; font-size:13px; color:#0a0f1c; background:#f2a93b; padding:12px 22px; border-radius:3px; text-decoration:none; font-weight:600;">Administrer din overvågning</a>
    </div>
  `;

  const text = [
    "Velkommen til Gossip Alert",
    "",
    "Hej, og velkommen til Gossip Alert. Tak fordi du er blevet kunde hos os.",
    keywordList ? `Vi holder nu øje med: ${keywordList}.` : "",
    "",
    `Administrer din overvågning: ${MANAGE_URL}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: "Velkommen til Gossip Alert",
    html: emailLayout({
      preheader: "Din overvågning er sat i gang — sådan får du mest ud af Gossip Alert.",
      bodyHtml,
      recipientEmail,
    }),
    text,
  };
}

export function goodbyeEmail(opts: { recipientEmail: string }): EmailPayload {
  const { recipientEmail } = opts;

  const bodyHtml = `
    <div style="font-family:${FONT_MONO}; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#3abfad; margin:0 0 14px;">Opsagt</div>
    <h1 style="font-family:${FONT_DISPLAY}; font-weight:600; font-size:22px; line-height:1.3; color:#edeae2; margin:0 0 14px;">
      Tak for samarbejdet
    </h1>
    <p style="color:#c7c3b8; font-size:14px; line-height:1.6; margin:0 0 14px;">
      Dit abonnement hos Gossip Alert er nu opsagt, og der bliver ikke trukket flere betalinger.
    </p>
    <p style="color:#c7c3b8; font-size:14px; line-height:1.6; margin:0 0 20px;">
      Du er altid velkommen tilbage, hvis du får brug for overvågning igen.
    </p>
  `;

  const text = [
    "Tak for samarbejdet",
    "",
    "Dit abonnement hos Gossip Alert er nu opsagt, og der bliver ikke trukket flere betalinger.",
    "Du er altid velkommen tilbage, hvis du får brug for overvågning igen.",
  ].join("\n");

  return {
    subject: "Din overvågning hos Gossip Alert er opsagt",
    html: emailLayout({
      preheader: "Dit abonnement er opsagt. Tak fordi du brugte Gossip Alert.",
      bodyHtml,
      recipientEmail,
    }),
    text,
  };
}
