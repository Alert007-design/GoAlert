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
  danske mediers RSS-feeds og Folketingets åbne data for hvert af deres
  søgeord, gemmer nye fund i tabellen "Mentions", og sender en e-mail via
  Resend. Kører én gang dagligt via `vercel.json` (Vercel Hobby-planens
  grænse — hyppigere tjek kræver Pro-plan). Undermoduler:
  - `dates.ts` — alle datoer regnes om til UTC ét sted
  - `freshness.ts` — 24-timers-reglen og vinduets længde
  - `urls.ts` — URL-normalisering
  - `grouping.ts` — dedup og gruppering af samme historie
  - `matching.ts` — søgeord matches som hele ord, også med æ, ø og å
  - `feeds.ts` — listen over RSS-kilder
- `app/api/debug/` — hjælperuter til at inspicere feeds og nyhedsfund.
  Kræver `CRON_SECRET` ligesom scannet
- `scripts/proevekoersel.ts` — prøvekørsel mod de rigtige kilder uden at
  skrive i Airtable eller sende mails

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
| `REDDIT_ENABLED` + nøgler | nej — Reddit er slået fra | scan |
| `CRON_SECRET` | **ja** — uden den er scan og debug låst | scan, debug |
| `SCAN_MAX_AGE_HOURS` | nej (default `24`) | scan |
| `NEXT_PUBLIC_SITE_URL` | nej (har default) | checkout, portal |

## De to ufravigelige krav

Scannet er bygget om, så begge krav håndhæves ét sted og er dækket af
automatiske tests (`npm test`), der kører sammen med `npm run build`.

### 1. Kun indhold fra det seneste døgn

Kilderne indsamler bredt og filtrerer **ikke** selv på alder. Al aldersregel
ligger i `app/api/cron/scan/freshness.ts`:

- Alle datoer regnes om til UTC ét sted (`dates.ts`). Datoer uden tidszone —
  som Folketingets — tolkes som dansk tid, ikke som serverens.
- Indhold uden brugbar dato kasseres og logges. Det får aldrig "nu" som dato.
- Indhold dateret i fremtiden kasseres.
- Oplyser kilden kun en dato uden klokkeslæt, regnes den fra døgnets
  begyndelse i dansk tid — det tidligst mulige, så intet fremstår nyere end
  det er.

### Vinduet

Vercels Hobby-plan udløser ikke cron-jobbet på et fast minuttal, men et
tilfældigt sted inden for timen. To kørsler kan derfor ligge mere end 24 timer
fra hinanden, og et fast 24-timers-vindue ville tabe indholdet i hullet.

Scannet husker derfor tidspunktet for sidste **vellykkede** kørsel i
Airtable-tabellen `ScanRuns` og kigger tilbage til dét tidspunkt — dog højst
48 timer. Findes tabellen ikke, bruges 24 timer, og der skrives en linje i
loggen. En kørsel med fejl markeres ikke som vellykket, så det der fejlede
ikke falder ud af vinduet i morgen.

### 2. Ingen gentagelser

- **URL-normalisering** (`urls.ts`): `http`/`https`, `www.`, `m.`, afsluttende
  skråstreg, `#fragment`, `utm_*` og andre sporingsparametre fjernes før både
  sammenligning og lagring. Gamle rækker normaliseres også på vej ind, så der
  ikke skal rettes i eksisterende data.
- **Dedup mod hele historikken**, ikke kun de seneste to uger.
- **Dedup inden for samme kørsel**, så to søgeord ikke kan give samme artikel
  to gange.
- **Samme historie i flere medier** (typisk Ritzau) grupperes på
  overskriftslighed og vises som én omtale med "også bragt i: …". Alle
  medlemmer gemmes, også de skjulte — ellers ville de tælle som nye i morgen.
- **Først gemt når mailen er sendt.** Kan mailen ikke sendes, gemmes intet, og
  omtalerne kommer med ved næste kørsel i stedet for at forsvinde.

## Airtable-struktur

- **Signups**: `Email`
- **Customers**: `Name`, `Email`, `Keywords` (komma-separeret, fx
  "Gulspurve, nattergale"), `Active` (checkbox), `StripeCustomerId`,
  `StripeSubscriptionId`
- **Mentions**: `CustomerEmail`, `Title`, `URL`, `Source`, `FoundAt`,
  `PublishedAt`
- **ScanRuns** (valgfri, men anbefalet): `RunAt` (dato med tid), `Status`
  (tekst: `ok` eller `fejl`), `Note` (tekst)

`FoundAt` er hvornår scannet fandt omtalen, `PublishedAt` hvornår kilden
udgav den. De to er ikke det samme.

Mangler `PublishedAt`-kolonnen, afviser Airtable hele rækken. Scannet opdager
det, slår kolonnen fra resten af kørslen og skriver i loggen, hvad der skal
rettes — i stedet for at tabe omtalen i stilhed, som det skete før.

## Tests

```
npm test
```

Testene dækker de to ufravigelige krav og kører automatisk som en del af
`npm run build`. En prøvekørsel mod de rigtige nyhedskilder, uden Airtable og
uden at sende mails:

```
npx tsx scripts/proevekoersel.ts regeringen politi
```

Den viser, at intet i resultatet er ældre end vinduet, og at anden kørsel i
træk giver nul nye omtaler.

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
