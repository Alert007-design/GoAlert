# Gossip Alert — v2

Frisk start på landing- og tilmeldingssiden. Next.js (app router) + TypeScript, ingen eksterne UI-biblioteker.

## Struktur

- `app/page.tsx` — selve siden (hero, "sådan virker det", CTA)
- `app/SignupForm.tsx` — tilmeldingsformularen (client component)
- `app/SignalBars.tsx` — den animerede "signal"-grafik i hero'en
- `app/api/signup/route.ts` — modtager tilmeldinger og gemmer dem i
  Airtable. Kræver miljøvariablerne `AIRTABLE_TOKEN` og
  `AIRTABLE_BASE_ID` (sat i Vercel → Settings → Environment Variables),
  samt en tabel kaldet "Signups" med et felt "Email" i den valgte base.
- `app/api/cron/scan/` — den daglige overvågning. Slår hver aktiv kunde
  (fra Airtable-tabellen "Customers") op i Google News og Reddit for
  deres søgeord, gemmer nye fund i tabellen "Mentions", og sender en
  e-mail via Resend, hvis der er noget nyt. Kører automatisk én gang
  dagligt via `vercel.json` (Vercel Hobby-planens grænse — kræver
  Pro-plan for hyppigere tjek). Kræver desuden `RESEND_API_KEY` og
  valgfrit `RESEND_FROM`.

## Airtable-struktur

- **Signups**: `Email`
- **Customers**: `Name`, `Email`, `Keyword`, `Active` (checkbox)
- **Mentions**: `CustomerEmail`, `Title`, `URL`, `Source`, `FoundAt`
- `app/globals.css` — al styling, ingen CSS-framework

## Køre lokalt

```
npm install
npm run dev
```

## Deploy

Push til GitHub, og importér repoet i Vercel — det virker uden yderligere
opsætning. Ingen miljøvariabler er påkrævet endnu.
