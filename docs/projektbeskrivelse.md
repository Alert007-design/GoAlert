# Gossip Alert — samlet projektbeskrivelse

> Dette dokument er en komplet beskrivelse af Gossip Alert-projektet. Det er
> skrevet, så det kan lægges ind som viden i et Claude-projekt og give fuld
> forståelse for hele sagen — forretning, produkt, teknik, dataflow, kilder,
> integrationer, miljøvariabler og kendte begrænsninger — uden at man behøver
> at læse kildekoden først.

---

## 1. Kort fortalt

**Gossip Alert** er en dansk web-tjeneste, der overvåger, hvad der bliver
skrevet om en person eller en virksomhed i offentligt tilgængelige danske
kilder, og sender en e-mail, så snart der dukker en ny omtale op. Formålet er
"early-warning for dit omdømme" — at få besked om et rygte eller en omtale,
mens den stadig er ny, i stedet for at opdage den for sent.

- **Målgruppe:** privatpersoner og mindre virksomheder i Danmark, der vil holde
  øje med deres eget navn, firmanavn eller et bestemt emne.
- **Kernefunktion:** kunden opretter op til 5 søgeord. En daglig automatisk
  scanning slår hvert søgeord op i en række danske kilder, gemmer nye fund og
  sender en opsummerende e-mail.
- **Prismodel:** første søgeord er gratis (uden kortoplysninger). Søgeord 2-5
  koster et fast, lavt månedligt beløb og afregnes via Stripe-abonnement.
- **Garantiprincip:** kunden får **altid** en mail efter dagens scanning — også
  når der ikke er fundet noget — så "intet fundet" aldrig forveksles med en
  teknisk fejl.

Projektet er i kildekoden markeret som **v2** ("Gossip Alert — v2", frisk start
på landing- og tilmeldingssiden).

---

## 2. Værditilbud og produktløfter (fra forsiden)

Sitet kommunikerer disse løfter til brugeren:

- **"Vid det, før alle andre gør."** Overvågning af, hvad der siges om dig eller
  din virksomhed på nettet, med besked mens et rygte stadig kan stoppes.
- **Gratis at komme i gang** — ingen kortoplysninger, uforpligtende.
- **Overskuelig mail** med links direkte til kilderne. Tjenesten gengiver
  **aldrig** hele artikler — der linkes altid til den oprindelige kilde.
- **Ærlig dækning:** "et voksende udvalg af offentligt og teknisk tilgængelige
  danske nyhedskilder" — med den eksplicitte forbehold, at ingen tjeneste kan
  garantere at fange alt.
- **Altid en mail:** både ved fund og ved intet fund, så kunden kan se forskel
  på "intet fundet" og en teknisk fejl.

Forsiden viser desuden et lille "Danmark lige nu"-panel med dagens 3 danske
historier (hentet server-side fra feeds og filtreret på sladder-/kendis-ord),
samt en animeret "signal"-grafik.

---

## 3. Teknologistak

| Lag | Valg |
| --- | --- |
| Framework | **Next.js 14.2.5** (App Router) |
| Sprog | **TypeScript** (strict) |
| UI | Rå React + egen CSS — **ingen eksterne UI-biblioteker** |
| Styling | Én fil, `app/globals.css`, med CSS-variabler (mørkt "ink"-tema, amber + teal accenter). Fonte: Fraunces (display), Inter (brødtekst), IBM Plex Mono (labels) via Google Fonts |
| Database / CRM | **Airtable** (via REST API, ikke SDK) |
| Betaling | **Stripe** (abonnement, Checkout + Billing Portal + webhooks) |
| E-mail | **Resend** (transaktionelle mails via REST API) |
| Hosting | **Vercel** (inkl. Vercel Cron) |
| Runtime for scanning | Next.js Route Handlers (`maxDuration = 60`) |

Der er **ingen** database ud over Airtable, ingen ORM, og ingen server-state ud
over nogle korte in-memory caches i scanning-koden.

---

## 4. Repository-struktur

```
.
├── README.md              # Kort teknisk intro (delvist forældet, se §12)
├── package.json           # next, react, react-dom, stripe
├── next.config.js         # Tom config
├── tsconfig.json          # Standard Next.js TS-opsætning, paths "@/*"
├── vercel.json            # Cron: /api/cron/scan dagligt kl. 06:00 UTC
└── app/
    ├── layout.tsx         # Rod-layout, <html lang="da">, fonte, metadata
    ├── page.tsx           # Forsiden (server component): hero, hvad-er-det,
    │                      #   sådan-virker-det, pris, CTA, footer
    ├── globals.css        # Al styling
    ├── SignupForm.tsx     # Tilmeldingsformular (client component)
    ├── SignalBars.tsx     # Animeret signal-grafik i hero
    ├── administrer/
    │   └── page.tsx       # "Administrer dit abonnement" — Stripe-portal-adgang
    └── api/
        ├── _lib/
        │   ├── resend.ts           # Fælles e-mail-afsendelse via Resend
        │   └── email-templates.ts  # Alle 4 mail-skabeloner (HTML + tekst)
        ├── signup/route.ts         # Gratis flow: 1 søgeord → Airtable + velkomstmail
        ├── checkout/route.ts       # Betalt flow: 2-5 søgeord → Stripe Checkout
        ├── portal/route.ts         # Stripe Billing Portal-session
        ├── webhooks/stripe/route.ts# Stripe webhooks (køb + opsigelse)
        ├── cron/scan/
        │   ├── route.ts            # Hovedkørslen (daglig scanning)
        │   ├── sources.ts          # fetchNews / fetchReddit / fetchFolketinget
        │   ├── feeds.ts            # RSS/Atom-feeds: liste, hentning, parsing
        │   ├── airtable.ts         # Kunder, kendte URL'er (dedup), gem mention
        │   └── email.ts            # Tynd wrapper: alert-mail / intet-fundet-mail
        └── debug/
            ├── feeds/route.ts      # Sundhedstjek af RSS-feeds (læser kun)
            └── news/route.ts       # Diagnose af Google News-feed (læser kun)
```

---

## 5. Datamodel (Airtable)

Der bruges én Airtable-base (`AIRTABLE_BASE_ID`) med tre tabeller.

### Tabel `Signups`
Simpelt historik/statistik-log over alle tilmeldinger.
- `Email` (tekst)

### Tabel `Customers`
Den aktive kundeliste — det er den, scanningen kører på.
- `Name` (tekst; oprettes typisk tom)
- `Email` (tekst)
- `Keywords` (tekst — **kan indeholde flere søgeord adskilt af komma**, fx
  `"Mette Frederiksen, Statsministeriet"`. Koden splitter på komma og scanner
  hvert søgeord for sig.)
- `Active` (checkbox — kun rækker med `Active = 1` scannes)
- `StripeCustomerId` (tekst — sættes ved betalt køb; bruges af portalen)
- `StripeSubscriptionId` (tekst — sættes ved betalt køb; bruges ved opsigelse)

### Tabel `Mentions`
Alle fund. Bruges både som historik og som **dedup-nøgle**, så samme URL ikke
sendes to gange.
- `CustomerEmail` (tekst)
- `Title` (tekst)
- `URL` (tekst — dedup sker på denne)
- `Source` (tekst — fx "DR", "Reddit (r/Denmark)", "Folketinget (åbne data)")
- `FoundAt` (dato/tid — hvornår **vi** fandt det)
- `PublishedAt` (dato/tid — hvornår **kilden** udgav det)

> Vigtig skelnen i koden: `FoundAt` ≠ `PublishedAt`. Et fund tæller kun som "nyt"
> hvis kilden har udgivet det inden for tidsvinduet (typisk 24 timer), og hvis
> URL'en ikke allerede findes i `Mentions` inden for dedup-vinduet.

---

## 6. Brugerflows

### 6.1 Tilmelding (forsiden → `SignupForm.tsx`)
Formularen tager en e-mail og 1-5 søgeord. Prisen vises live:
1 søgeord = gratis, 2 = 19 kr/md, 3 = 29, 4 = 39, 5 = 49 (det første er altid
gratis, resten er betaling).

- **1 søgeord (gratis flow):** POST til `/api/signup`.
- **2-5 søgeord (betalt flow):** POST til `/api/checkout`, som returnerer en
  Stripe Checkout-URL, hvorefter browseren redirectes til betaling.

### 6.2 `/api/signup` (gratis, ét søgeord)
1. Validerer e-mail og at der er præcis ét søgeord (ellers henvises til
   `/api/checkout`).
2. Slår op i `Customers`: hvis e-mailen **allerede** er kunde, returneres 409
   med koden `UPGRADE_REQUIRED` — gratis-tilmelding er kun for nye kunder.
3. Logger tilmeldingen i `Signups`.
4. Opretter kunden i `Customers` med det ene søgeord og `Active = true`.
5. Sender velkomstmail via Resend.

### 6.3 `/api/checkout` (betalt, 2-5 søgeord)
1. Validerer e-mail og at der er 2-5 søgeord.
2. Vælger det rigtige Stripe-pris-ID ud fra antal søgeord
   (`STRIPE_PRICE_2KW` … `STRIPE_PRICE_5KW`).
3. Opretter en Stripe Checkout-session i `subscription`-mode, med e-mail og
   søgeord lagt i `metadata` (så webhooken kan oprette kunden bagefter).
4. Returnerer session-URL'en til frontenden.

### 6.4 `/api/webhooks/stripe` (Stripe → os)
Verificerer signaturen med `STRIPE_WEBHOOK_SECRET` og håndterer:
- **`checkout.session.completed`** (gennemført køb): opretter eller opdaterer
  kunden i `Customers` med søgeord, `Active = true`, `StripeCustomerId` og
  `StripeSubscriptionId`. Kun **nye** kunder får velkomstmail (en opgradering
  udløser ikke en ny velkomst).
- **`customer.subscription.deleted`** (opsagt abonnement): finder kunden (via
  subscription-ID, ellers customer-ID), sætter `Active = false` og sender en
  opsigelses-/farvelmail.

### 6.5 `/administrer` + `/api/portal` (selvbetjening)
Kunden indtaster sin e-mail, `/api/portal` finder `StripeCustomerId` i Airtable
og åbner en **Stripe Billing Portal**-session, hvor kunden selv kan se og
opsige sit abonnement. Har kunden kun det gratis søgeord (ingen
`StripeCustomerId`), returneres en 404 med en forklarende besked.

### 6.6 Den daglige scanning (`/api/cron/scan`)
Udløses af Vercel Cron én gang i døgnet (06:00 UTC, jf. `vercel.json`).
Beskyttet af `CRON_SECRET` (Bearer-token) hvis sat.

Kørslens forløb:
1. Hent alle aktive kunder (`Active = 1`) — **uden Next.js-cache** (`no-store`),
   så ændrede søgeord og opsigelser slår igennem med det samme.
2. For hver kunde (isoleret — én kundes fejl stopper ikke resten):
   - Hent kundens allerede kendte URL'er fra `Mentions` (dedup-vindue, se §7).
   - For hvert søgeord: kør `fetchNews`, `fetchReddit` og `fetchFolketinget`
     parallelt (`Promise.allSettled`). En kilde der fejler noteres som et
     "source issue", men vælter ikke resten.
   - Filtrér nye fund fra (URL ikke set før), gem dem i `Mentions`, og undgå at
     samme URL rapporteres under flere søgeord i samme kørsel.
3. Hvis der er mindst ét nyt fund: send **alert-mail** med resultater grupperet
   pr. søgeord. Ellers: send **intet-fundet-mail** (med en note, hvis en kilde
   reelt fejlede teknisk).
4. Returnér et JSON-resumé pr. kunde (antal fund, nye, source issues, evt. fejl).

---

## 7. Kilder og scanning i detaljer

Alle kilder leverer et fælles `FoundItem`: `{ title, url, source, publishedAt }`.

### 7.1 Danske nyhedsmedier via RSS/Atom (`feeds.ts` + `fetchNews`)
- Der hentes **direkte fra mediernes egne RSS-feeds**, ikke fra Google News.
  Baggrund (dokumenteret i koden): Google News' RSS-søgning returnerede
  udelukkende norske kilder trods `hl=da&gl=DK`, og indholdet var måneder
  gammelt.
- Feed-listen (`FEEDS`) indeholder bl.a. **DR** (senestenyt, indland, politik,
  penge, udland, kultur, viden — alle bekræftede), samt **ikke-bekræftede**
  kandidater: Politiken, Information, Ekstra Bladet, TV 2, Berlingske,
  Altinget, B.T., Børsen. `verified`-flaget markerer hvilke der er bekræftet;
  sundhedstjekket (`/api/debug/feeds`) afgør resten.
- Både RSS (`<item>`) og Atom (`<entry>`) parses med regex (ingen XML-lib).
- **Entity-afkodning:** danske feeds koder æ/ø/å og typografiske anførselstegn
  som numeriske HTML-referencer. `decodeEntities` oversætter dem, så titler er
  læsbare og søgeord med æ/ø/å kan matche.
- **Cache:** feeds hentes én gang pr. kørsel (10 min. in-memory cache) og
  genbruges på tværs af kunder og søgeord.
- Et match kræver, at søgeordet (små bogstaver) findes i "haystack" = titel +
  resumé. Kun indlæg inden for tidsvinduet (`SCAN_MAX_AGE_HOURS`, default 24)
  tælles. Hvis **alle** feeds fejler, kastes en fejl (reel fejl ≠ "ingen
  nyheder"). Maks. 25 fund pr. søgeord.

### 7.2 Reddit (`fetchReddit`)
- OAuth (client credentials) mod Reddit; access-token caches in-memory til det
  udløber. Kræver `REDDIT_CLIENT_ID` og `REDDIT_CLIENT_SECRET`.
- Søger `https://oauth.reddit.com/search` sorteret på nyeste, sidste døgn,
  maks. 25. Filtrerer på udgivelsestidspunkt inden for tidsvinduet.
- Kilde vises som `Reddit (r/<subreddit>)`.

### 7.3 Folketingets åbne data (`fetchFolketinget`)
- Slår op i `oda.ft.dk/api/Dokument` med et OData-`$filter` på titel
  (`substringof`) og dato. Bruger `Dokument` (har rigtig `dato`) frem for `Sag`
  (har kun opdateringsdato).
- Kompenserer for at Folketingets datoer er i dansk lokaltid uden tidszone
  (serveren kører UTC) med 3 timers "grace".
- Link peger på Folketingets søgeside for dokumentets titel.

### 7.4 Forsidens "Danmark lige nu" (`fetchTopDanishStories`)
- Genbruger feed-høsten, filtrerer på sladder-/kendis-ord (fx "kendis",
  "reality", "royale", "kongehus", "skilsmisse", "stjerne"), sidste 3 dage,
  og vælger op til 3 historier med forskellig kilde. Fejler feeds, vises
  panelet blot tomt — det vælter ikke forsiden.

### 7.5 Dedup (`airtable.ts` → `getKnownUrls`)
- Henter kundens kendte URL'er fra `Mentions` inden for `DEDUP_WINDOW_DAYS`
  (default 14). **Følger Airtables `offset`-paginering** (100 rækker pr. side),
  så mere end 100 kendte URL'er ikke ved en fejl bliver rapporteret igen.
  Rækker uden `FoundAt` tages altid med. Nødbremse ved 100 sider.

---

## 8. E-mails (`_lib/email-templates.ts` + `_lib/resend.ts`)

Alle mails sendes via **Resend** med én fælles funktion (`sendViaResend`).
Der er fire skabeloner, alle med samme mørke design (matcher sitet) og både
HTML- og tekstversion:

1. **`alertWithResultsEmail`** — nye omtaler fundet. Grupperer fund pr. søgeord
   (kun søgeord med reelle fund vises), fremhæver søgeordet i titel/uddrag,
   viser kilde + dansk dato/klokkeslæt (Europe/Copenhagen), evt. type-badge og
   thumbnail, og en "Læs historien"-knap der linker til kilden.
2. **`alertNoResultsEmail`** — scanning gennemført, intet nyt. Understreger at
   det er gode nyheder. Hvis en kilde fejlede teknisk, vises en note om det —
   adskilt fra "intet fundet".
3. **`welcomeEmail`** — sendes ved ny (gratis eller betalt) tilmelding.
4. **`goodbyeEmail`** — sendes når et abonnement opsiges.

Designnoter i koden: mailklienter (især Outlook) understøtter ikke CSS-variabler
eller webfonte pålideligt, så farver er faste hex-værdier (hentet fra
`globals.css`) og fonte er sikre fallback-stakke (Georgia/system-sans/Courier).
Al brugerinput HTML-escapes; URL'er escapes så et anførselstegn ikke kan bryde
ud af en `href`. Der er en usynlig preheader-tekst pr. mail.

---

## 9. Miljøvariabler

| Variabel | Bruges til | Påkrævet |
| --- | --- | --- |
| `AIRTABLE_TOKEN` | Airtable API-token | Ja |
| `AIRTABLE_BASE_ID` | Airtable base-ID | Ja |
| `AIRTABLE_TABLE_NAME` | Navn på Signups-tabel (default `Signups`) | Nej |
| `RESEND_API_KEY` | Afsendelse af e-mail | Ja (til mails) |
| `RESEND_FROM` | Afsender-adresse | Ja (til mails) |
| `STRIPE_SECRET_KEY` | Stripe API | Ja (til betaling) |
| `STRIPE_WEBHOOK_SECRET` | Verificér webhook-signatur | Ja (til webhooks) |
| `STRIPE_PRICE_2KW` … `STRIPE_PRICE_5KW` | Pris-ID pr. antal søgeord | Ja (til betaling) |
| `NEXT_PUBLIC_SITE_URL` | Success/cancel/return-URL'er (default gossipalert.dk) | Nej |
| `CRON_SECRET` | Beskytter `/api/cron/scan` | Anbefalet |
| `SCAN_MAX_AGE_HOURS` | Tidsvindue for "nyt" fund (default 24) | Nej |
| `DEDUP_WINDOW_DAYS` | Hvor langt tilbage kendte URL'er hentes (default 14) | Nej |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Reddit OAuth | Ja (til Reddit) |
| `REDDIT_USER_AGENT` | Reddit User-Agent | Nej |

---

## 10. Deployment og drift

- **Hosting:** Vercel. Repoet importeres direkte; App Router-strukturen kører
  uden yderligere byggeopsætning.
- **Cron:** `vercel.json` planlægger `/api/cron/scan` til `0 6 * * *` (kl. 06:00
  UTC). Én daglig kørsel er **Vercel Hobby-planens grænse** — hyppigere tjek
  kræver Pro-plan.
- **Sikkerhed på cron:** hvis `CRON_SECRET` er sat, skal kaldet bære
  `Authorization: Bearer <secret>`.
- **Kør lokalt:** `npm install` og `npm run dev`.

### Diagnose-endpoints (læser kun, sender ingen mails)
- **`/api/debug/feeds`** — sundhedstjek af alle RSS-feeds: hvilke svarer, hvor
  mange indlæg, hvor friske. Valgfrit `?q=søgeord` viser hvilke artikler der
  ville blive fundet, og `?timer=N` justerer tidsvinduet.
- **`/api/debug/news`** — diagnose af det gamle Google News-feed: viser pr. item
  om kilden regnes for dansk, dato/alder og om det ville blive beholdt. Bruges
  til at se, om det danske kildefilter er for stramt.

---

## 11. Designprincipper og bevidste valg (fra koden)

- **Ingen forveksling af "intet fundet" og "fejl":** kunden får altid en mail,
  og tekniske kildefejl markeres eksplicit som source issues.
- **Isolering pr. kunde:** en fejl for én kunde afbryder ikke hele kørslen.
- **Ingen cache hvor det tæller:** Airtable-opslag i scanning bruger
  `cache: "no-store"`, fordi Next.js ellers cachede kundedata og lod scanningen
  køre på forældede søgeord.
- **Dedup på URL med paginering:** undgår dubletter, også ved >100 kendte
  URL'er.
- **Ærlig markedsføring:** forsiden lover eksplicit ikke fuld dækning — kun "et
  voksende udvalg" af kilder.
- **Gengiver aldrig hele artikler:** der linkes altid til kilden.
- **Robust dansk tekst:** entity-afkodning og tidszonestyring (Europe/Copenhagen)
  gennemgående.

---

## 12. Kendte begrænsninger og uoverensstemmelser (vigtigt at kende)

Disse punkter er reelle forhold i kodebasen, som et Claude-projekt bør kende, så
det ikke svarer forkert:

1. **README er delvist forældet.** `README.md` beskriver kilderne som "Google
   News og Reddit" og siger "Ingen miljøvariabler er påkrævet endnu". I praksis:
   - Kilderne er nu **RSS-feeds fra danske medier + Reddit + Folketinget**
     (Google News blev droppet, se §7.1).
   - Der **kræves** miljøvariabler (Airtable, Resend, Stripe m.fl.).
   - README nævner et felt `Keyword` (ental) på `Customers`; koden bruger
     `Keywords` (flertal, kommasepareret).
2. **Feed-dækning er ujævn.** Kun DR's feeds er bekræftede. Flere store medier
   (Politiken, Berlingske, TV 2 m.fl.) står som `verified: false`, og nogle
   afviser forbindelser fra Vercel. Faktisk dækning afhænger af hvilke feeds der
   svarer — brug `/api/debug/feeds` til at se status.
3. **Én daglig kørsel + korte feeds.** Et mediefeed rummer typisk kun de seneste
   20-50 artikler. Med kun én daglig scanning kan travle feeds nå at rulle forbi
   mellem to kørsler — en kendt begrænsning, ikke en fejl.
4. **Regex-baseret feed-parsing.** Der bruges ikke en rigtig XML-parser;
   usædvanligt formaterede feeds kan blive misforstået.
5. **`fetchTopDanishStories` refereres i README som "Google News"**, men henter i
   praksis fra de samme RSS-feeds som resten.
6. **Gratis-opgradering:** en eksisterende kunde kan ikke tilføje søgeord via
   gratis-flowet (`/api/signup` giver 409 `UPGRADE_REQUIRED`); opgradering sker
   via Stripe-checkout.

---

## 13. Ordliste

- **Søgeord (keyword):** det ord/navn kunden vil overvåges for. En kunde kan have
  1-5, gemt kommasepareret i `Customers.Keywords`.
- **Mention (fund/omtale):** en fundet artikel/post, gemt i `Mentions`.
- **Source issue:** en kilde der fejlede teknisk under en scanning (adskilt fra
  "intet fundet").
- **Tidsvindue (`SCAN_MAX_AGE_HOURS`):** hvor gammelt et fund må være for at
  tælle som "nyt" (default 24 timer).
- **Dedup-vindue (`DEDUP_WINDOW_DAYS`):** hvor langt tilbage kendte URL'er hentes
  for at undgå dubletter (default 14 dage).
- **Alert-mail / intet-fundet-mail:** de to daglige udfald af en scanning.
