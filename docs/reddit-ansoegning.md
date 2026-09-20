# Reddit-adgang: ansøgning og opsætning

> **Status: ansøgningen er sendt 20. september 2026 fra kontoen
> `u/OldEmploy3572`.** Vi venter på svar fra Reddit.
>
> Reddit er slået fra i Gossip Alert (`REDDIT_ENABLED`) og forbliver slukket,
> indtil godkendelsen er i hus.

## Rækkefølgen

Det er vigtigt, og det stod forkert i en tidligere udgave af dette dokument:

1. **Først** søger du om adgang hos Reddit.
2. **Derefter**, når godkendelsen er i hus, opretter du appen på
   `reddit.com/prefs/apps` og henter nøglerne.
3. Til sidst sætter du nøglerne i Vercel.

Der er ingen grund til at oprette en app, før ansøgningen er godkendt —
nøglerne kan alligevel ikke bruges til noget uden godkendelsen, og
ansøgningen kræver dem ikke.

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

---

## Trin 1 — Søg om adgang

Gå til <https://support.reddithelp.com/hc/en-us/requests/new> og vælg
kategorien for API- eller udvikleradgang.

### Det, der er vigtigt at få med

Reddit afviser ofte ansøgninger, der er vage om formålet. Sørg for, at disse
fire ting står tydeligt:

- **kun læsning** — ingen opslag, stemmer eller beskeder
- **lav volumen** — få kald om dagen
- **ikke-kommerciel** — ingen kunder, ingen reklamer, ingen videresalg
- **hvad du gemmer** — og hvorfor du overhovedet gemmer noget

### Forslag til teksten

Skriv på engelsk. Denne tekst dækker de fire punkter:

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

---

## Indsendt tekst

*Den faktiske tekst, som blev sendt til Reddit den 20. september 2026 fra
`u/OldEmploy3572`. Indsæt den her, så vi ved præcis, hvad der er lovet — det
er den, vi skal holde os til, hvis adgangen senere skal bruges eller udvides.*

<!-- Indsæt den indsendte tekst nedenfor. -->

```
(indsæt her)
```

**Svar fra Reddit:** *(udfyldes, når der kommer svar — dato og udfald)*

---

## Trin 2 — Opret appen, når du er godkendt

Først når godkendelsen er i hus:

1. Log ind på Reddit med `u/OldEmploy3572`
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
navn) og en **secret**.

## Trin 3 — Sæt nøglerne i Vercel

Under **Settings → Environment Variables**:

| Navn | Værdi |
| --- | --- |
| `REDDIT_ENABLED` | `true` |
| `REDDIT_CLIENT_ID` | dit client id fra trin 2 |
| `REDDIT_CLIENT_SECRET` | din secret fra trin 2 |
| `REDDIT_USER_AGENT` | `server:gossip-alert:v1.0 (by /u/OldEmploy3572)` |

Reddit beder udtrykkeligt om en genkendelig afsender — derfor
`REDDIT_USER_AGENT` med dit eget brugernavn.

Udløs derefter en ny deployment i Vercel, så variablerne slår igennem.

**Send aldrig din secret til nogen — heller ikke i en chat.** Den skal kun
stå i Vercel.

## Hvad der ikke gøres

Der bygges ingen omvej uden om Reddits adgangsbegrænsninger. Bliver kaldene
blokeret, står det i loggen og i mailen som en kilde, der ikke kunne tjekkes —
ikke som en tavs fejl.
