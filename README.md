# Gossip Alert — v2

Omdømmeovervågning: et dagligt cronjob slår søgeord op i danske kilder og
sender en mail med nye omtaler. Next.js (app router) + TypeScript, ingen
eksterne UI-biblioteker.

> **Tjenesten kører uden betaling og uden åben tilmelding.**
> Betalingsfunktionen og tilmeldingsformularen er slået fra via to afbrydere,
> se [Afbrydere](#afbrydere). Stripe-koden er bevaret og kan tændes igen.

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
  - `feeds.ts` — hentning og læsning af feeds
  - `sources-table.ts` — kildelisten fra Airtable
  - `anbefalede-kilder.ts` — de 25 bekræftede kilder, og de afprøvede der
    ikke virker
  - `kildeliste.ts` — reservelisten, hvis Airtable ikke kan læses
- `app/api/debug/` — hjælperuter til at inspicere feeds og nyhedsfund.
  Kræver `CRON_SECRET` ligesom scannet
- `scripts/proevekoersel.ts` — prøvekørsel mod de rigtige kilder uden at
  skrive i Airtable eller sende mails
- `scripts/tjek-kilder.ts` — afprøver kildeadresser med rigtige kald, så
  ingen adresse gættes
- `docs/reddit-ansoegning.md` — sådan søger du om Reddit-adgang
- `docs/meta-ansoegning.md` — hvad en Facebook/Instagram-ansøgning kræver

## Afbrydere

To miljøvariabler styrer, hvad der er tændt. Begge er **slået fra**, når de er
tomme, og kun præcis `true` tænder dem. De skal altså tændes aktivt — glemmer
man at sætte dem, er resultatet den lukkede tilstand.

### `PAYMENTS_ENABLED` — betaling

Slået fra betyder:

- `/api/checkout`, `/api/portal` og `/api/webhooks/stripe` svarer 503 med en
  forklaring og **kontakter ikke Stripe**. Webhooken verificerer ikke engang
  signaturen.
- Prisafsnittet forsvinder fra forsiden.
- Ingen mail nævner abonnement, betaling eller pris, og ingen mail linker til
  `/administrer`.
- `/administrer` forklarer, at der ikke er noget abonnement at administrere.

Ingen Stripe-kode er slettet. Sæt variablen til `true` for at tænde alt igen.

### `SIGNUPS_ENABLED` — tilmelding

Slået fra betyder:

- Tilmeldingsformularen vises ikke på forsiden, og knapperne "Få adgang" og
  "Skriv dig op nu" er væk.
- `/api/signup` svarer 503 og opretter ingen i Airtable. Tjekket ligger først
  i ruten, så en lukket formular ikke kan omgås ved at kalde adressen direkte.

Egne søgeord tilføjes i stedet direkte i Airtable-tabellen `Customers`:
opret en række med din e-mail, dine søgeord kommasepareret i `Keywords`, og
flueben i `Active`.

Er tilmelding tændt, mens betaling er slukket, kan man tilmelde sig med **op
til 5 søgeord gratis** — der er ikke noget at opgradere til.

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
| `PAYMENTS_ENABLED` | nej — **fra** som standard | hele betalingsfunktionen |
| `SIGNUPS_ENABLED` | nej — **fra** som standard | forside, signup |
| `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` | ja | signup, checkout-webhook, portal, scan |
| `AIRTABLE_TABLE_NAME` | nej (default `Signups`) | signup |
| `STRIPE_SECRET_KEY` | kun hvis betaling er til | checkout, portal, webhook |
| `STRIPE_WEBHOOK_SECRET` | kun hvis betaling er til | webhook |
| `STRIPE_PRICE_2KW` … `STRIPE_PRICE_5KW` | kun hvis betaling er til | checkout |
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
- **Sources** (valgfri): kildelisten, se [Kilderne styres fra Airtable](#kilderne-styres-fra-airtable)

`FoundAt` er hvornår scannet fandt omtalen, `PublishedAt` hvornår kilden
udgav den. De to er ikke det samme.

Mangler `PublishedAt`-kolonnen, afviser Airtable hele rækken. Scannet opdager
det, slår kolonnen fra resten af kørslen og skriver i loggen, hvad der skal
rettes — i stedet for at tabe omtalen i stilhed, som det skete før.

## Kilderne styres fra Airtable

Kilderne ligger i Airtable-tabellen `Sources`, så de kan tilføjes og fjernes
uden kodeændringer. Tabellen er **frivillig**: findes den ikke, bruges
reservelisten i `app/api/cron/scan/kildeliste.ts`, og der skrives én linje i
loggen. En manglende hjælpetabel må aldrig kunne stoppe overvågningen.

### Kolonner

| Kolonne | Felttype i Airtable | Hvad den bruges til |
| --- | --- | --- |
| `Name` | Single line text | Kildenavnet, som det vises i mailen |
| `Platform` | Single line text | `rss`, `youtube`, `mastodon`, `bluesky`, `wikipedia` … |
| `Type` | Single select: `feed`, `search` | `feed` = hent alt og filtrér lokalt. `search` = spørg pr. søgeord |
| `URL` | Single line text | Adressen eller identifikatoren |
| `Active` | Checkbox | Kun afkrydsede kilder hentes |
| `LastStatus` | Single line text | Skrives af kildetjekket |
| `LastChecked` | Date med tid | Skrives af kildetjekket |
| `LastItemCount` | Number (heltal) | Skrives af kildetjekket |

Mangler `Platform`, antages `rss`. Er `Type` noget andet end `search`,
behandles kilden som `feed`. En række uden `Name` eller `URL` springes over
med en linje i loggen i stedet for at vælte kørslen.

Er tabellen tom, eller har ingen rækker flueben i `Active`, bruges
reservelisten — det er næsten altid en fejl, ikke et ønske om ingen kilder.

### Sådan fylder du tabellen op

De anbefalede kilder ligger i `app/api/cron/scan/anbefalede-kilder.ts`. De
lægges ind i Airtable med:

```
GET /api/debug/sources            viser kun, hvad der ville ske
GET /api/debug/sources?tilfoej=1  opretter de manglende rækker
```

Ruten kan køres igen og igen uden at lave rod:

- Der tilføjes **kun** kilder, tabellen ikke har i forvejen.
- Der sammenlignes på normaliseret adresse, så `www`, `http` og en
  afsluttende skråstreg ikke narrer den til at oprette en dublet.
- Eksisterende rækker ændres **aldrig**, og der slettes aldrig noget.
- En kilde, du bevidst har slået fra i Airtable, bliver ikke tilføjet igen.

Kilder, du selv har tilføjet, vises under `dineEgneKilder` — de røres ikke.

### Reglen om kildeadresser

**En feed-adresse må aldrig gættes.** En adresse må kun stå i den anbefalede
liste, hvis den er afprøvet med et rigtigt kald og har svaret med læsbare
indlæg. Efterprøv hele listen med:

```
npx tsx scripts/tjek-kilder.ts
```

Eller afprøv en kandidat, før den tilføjes:

```
npx tsx scripts/tjek-kilder.ts https://eksempel.dk/rss
```

Scriptet bruger den samme parser som selve scannet, så "virker her" betyder
"virker i scannet" — ikke bare "serveren svarede". Det afslutter med en
fejlkode, hvis en kilde ikke leverer læsbare indlæg, så det kan bruges som en
kontrol og ikke bare en udskrift.

Adresser, der **er** afprøvet og ikke virker, står i `AFPRØVET_UDEN_HELD` i
samme fil — med grunden. Det er for at ingen, heller ikke om et halvt år,
prøver den samme døde adresse igen i god tro. En test sikrer, at en adresse
ikke kan stå begge steder.

### Kildetjek — også fra Vercel

```
GET /api/debug/feeds
GET /api/debug/feeds?q=søgeord&timer=48
GET /api/debug/feeds?gem=1
```

Kræver `CRON_SECRET` som `Authorization: Bearer <værdi>`.

`?gem=1` skriver `LastStatus`, `LastChecked` og `LastItemCount` tilbage i
`Sources`, så status kan ses direkte i Airtable.

Ruten er bygget til at kunne køres **fra Vercel**, ikke kun lokalt. Det er
pointen: Vercel har andre IP-adresser end en privat forbindelse, og flere
tjenester behandler datacentre anderledes. En kilde, der svarer hjemmefra,
kan være blokeret i drift — og det er driften, der tæller.

## Den fælles datamodel

Alle kilder leverer præcis de samme felter videre i systemet:

```
title, url, source, platform, publishedAt, excerpt
```

Det er dét, der gør, at en ny kilde kan tilføjes uden at røre mailen,
dedup'en eller aldersreglen. Og det betyder, at en ny platform ikke kan
slippe uden om 24-timers-reglen — den går gennem det samme ene sted som alt
andet. Der er en test, der holder øje med netop dét.

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
