# Sådan søger du om adgang til Reddits API

Reddit er slået fra i Gossip Alert og forbliver slukket, indtil du har fået
godkendelsen. Når du har den, tændes kilden ved at sætte `REDDIT_ENABLED=true`
og de to nøgler i Vercel — koden er der allerede.

## Hvorfor det er nødvendigt

Reddit strammede reglerne i 2026. Deres politik siger nu, at man skal søge om
adgang og have udtrykkelig godkendelse, før man henter data gennem deres API.
Siden maj 2026 afviser de også kald til de åbne adresser, som ikke er logget
ind.

Det er målt, ikke gættet: ved en afprøvning 20. september 2026 gik ét enkelt
kald til r/Denmark igennem, hvorefter alt blev afvist — også med fem sekunders
pause mellem kaldene.

**Den gode nyhed:** gratis, ikke-kommerciel brug er tilladt inden for cirka
100 kald i minuttet. Gossip Alert laver nogle få kald om dagen, så du er
langt under grænsen.

## Trin 1 — Opret en app hos Reddit

1. Log ind på din Reddit-konto
2. Gå til <https://www.reddit.com/prefs/apps>
3. Rul ned og klik **create another app...**
4. Udfyld:
   - **name**: `Gossip Alert`
   - **type**: vælg **script** — det er den rigtige til noget, der kun kører
     på din egen server og kun læser
   - **description**: `Privat omdømmeovervågning. Kun læsning, få kald dagligt.`
   - **about url**: `https://www.gossipalert.dk`
   - **redirect uri**: `https://www.gossipalert.dk` — feltet skal udfyldes,
     men bruges ikke af en script-app
5. Klik **create app**

Du får nu to værdier: et **client id** (den korte streng lige under appens
navn) og en **secret**. De skal i Vercel, ikke i koden — se sidst i dokumentet.

## Trin 2 — Søg om adgang til data

Reddit kræver, at du beskriver, hvad du bruger data til. Gå til
<https://support.reddithelp.com/hc/en-us/requests/new> og vælg kategorien for
API- eller udvikleradgang.

### Forslag til teksten

Skriv på engelsk. Du kan bruge dette og rette til, så det passer:

> **Use case:** Personal reputation monitoring for myself.
>
> I run a small private tool that checks whether my own name is mentioned in
> Danish public sources. It reads a handful of Danish subreddits (r/Denmark,
> r/dkpolitik) once per day and emails me a summary if my name appears.
>
> **Access type:** Read-only. I do not post, vote, comment or message.
>
> **Volume:** A few requests per day. Far below the 100 requests per minute
> limit for non-commercial use.
>
> **Commercial use:** None. The tool is not sold, has no customers, no
> advertising and no paying users. It is used by one person — me.
>
> **Data retention:** I store only a link, a title and a timestamp for posts
> that match my name, so the same post is not reported to me twice. No user
> profiles, no full post contents, no bulk collection, and nothing is shared
> with anyone else.
>
> **App name:** Gossip Alert
> **Client ID:** (indsæt dit client id her)

### Det, der er vigtigt at få med

Reddit afviser ofte ansøgninger, der er vage om formålet. Sørg for, at disse
fire ting står tydeligt:

- **kun læsning** — ingen opslag, stemmer eller beskeder
- **lav volumen** — få kald om dagen
- **ikke-kommerciel** — ingen kunder, ingen reklamer, ingen videresalg
- **hvad du gemmer** — og hvorfor du overhovedet gemmer noget

## Trin 3 — Når du har fået godkendelsen

Sæt tre miljøvariabler i Vercel under **Settings → Environment Variables**:

| Navn | Værdi |
| --- | --- |
| `REDDIT_ENABLED` | `true` |
| `REDDIT_CLIENT_ID` | dit client id fra trin 1 |
| `REDDIT_CLIENT_SECRET` | din secret fra trin 1 |

Sæt desuden `REDDIT_USER_AGENT` til noget, der identificerer dig, for eksempel
`server:gossip-alert:v1.0 (by /u/ditbrugernavn)`. Reddit beder udtrykkeligt om
en genkendelig afsender.

Udløs derefter en ny deployment i Vercel, så variablerne slår igennem.

**Send aldrig din secret til nogen — heller ikke i en chat.** Den skal kun
stå i Vercel.

## Hvad der ikke gøres

Der bygges ingen omvej uden om Reddits adgangsbegrænsninger. Bliver kaldene
blokeret, står det i loggen og i mailen som en kilde, der ikke kunne tjekkes —
ikke som en tavs fejl.
