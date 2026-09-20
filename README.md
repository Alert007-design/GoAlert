# Gossip Alert — v2

Landing- og tilmeldingsside med Stripe-abonnement og daglig overvågning.
Next.js (app router) + TypeScript, ingen eksterne UI-biblioteker.

## Struktur

- `app/page.tsx` — selve siden (hero, "sådan virker det", CTA)
- `app/SignupForm.tsx` — tilmeldingsformularen (client component)
- `app/SignalBars.tsx` — den animerede "signal"-grafik i hero'en
- `app/globals.css` — al styling, ingen CSS-framework
- `app/administrer/page.tsx` — side hvor kunder kan åbne Stripes kundeportal
- `app/api/signup/route.ts` — modtager tilmeldinger og gemmer dem i
  Airtable-tabellen "Signups"
- `app/api/checkout/route.ts` — opretter en Stripe Checkout-session.
  Prisen vælges ud fra antal søgeord (2-5)
- `app/api/webhooks/stripe/route.ts` — modtager Stripe-events og opretter,
  opdaterer eller deaktiverer kunden i Airtable-tabellen "Customers"
- `app/api/portal/route.ts` — slår kunden op på e-mail og åbner Stripes
  billing portal
- `app/api/cron/scan/` — den daglige overvågning. Slår hver aktiv kunde op i
  Google News, Reddit og Folketinget for hvert af deres søgeord, gemmer nye
  fund i tabellen "Mentions", og sender en e-mail via Resend. Kører én gang
  dagligt via `vercel.json` (Vercel Hobby-planens grænse — hyppigere tjek
  kræver Pro-plan)
- `app/api/debug/` — hjælperuter til at inspicere feeds og nyhedsfund

## Miljøvariabler

Alle variabler er dokumenteret i [`.env.local.example`](.env.local.example)
med hvad der holder op med at virke, hvis de mangler.

Lokalt:

```
cp .env.local.example .env.local
```

I produktion sættes de samme variabler i Vercel → Settings → Environment
Variables.

`.env.local` er git-ignoreret og må aldrig committes — den indeholder
Stripe- og Airtable-nøgler.

Kort overblik:

| Variabel | Påkrævet | Bruges af |
| --- | --- | --- |
| `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` | ja | signup, checkout-webhook, portal, scan |
| `AIRTABLE_TABLE_NAME` | nej (default `Signups`) | signup |
| `STRIPE_SECRET_KEY` | ja | checkout, portal, webhook |
| `STRIPE_WEBHOOK_SECRET` | ja | webhook |
| `STRIPE_PRICE_2KW` … `STRIPE_PRICE_5KW` | ja | checkout |
| `RESEND_API_KEY`, `RESEND_FROM` | ja (begge) | scan |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | nej — Reddit springes over | scan |
| `REDDIT_USER_AGENT` | nej (har default) | scan |
| `CRON_SECRET` | nej — men uden den er scan-ruten åben | scan |
| `SCAN_MAX_AGE_HOURS` | nej (default `24`) | scan |
| `DEDUP_WINDOW_DAYS` | nej (default `14`) | scan |
| `NEXT_PUBLIC_SITE_URL` | nej (har default) | checkout, portal |

## Airtable-struktur

- **Signups**: `Email`
- **Customers**: `Name`, `Email`, `Keywords` (komma-separeret, fx
  "Gulspurve, nattergale"), `Active` (checkbox), `StripeCustomerId`,
  `StripeSubscriptionId`
- **Mentions**: `CustomerEmail`, `Title`, `URL`, `Source`, `FoundAt`,
  `PublishedAt`

`FoundAt` er hvornår scannet fandt omtalen, `PublishedAt` hvornår kilden
udgav den. De to er ikke det samme.

## Køre lokalt

```
npm install
cp .env.local.example .env.local
npm run dev
```

Uden udfyldt `.env.local` kan forsiden vises, men signup, checkout,
webhooks og cron-scan vil fejle.

Webhooks lokalt kræver Stripe CLI:

```
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Deploy

Push til GitHub og importér repoet i Vercel. Husk at sætte
miljøvariablerne i Vercel — uden dem bygger appen, men API-ruterne fejler
i runtime.
