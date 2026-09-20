# Facebook og Instagram — hvad en ansøgning kræver

Dette dokument er **beslutningsgrundlag**, ikke en opskrift, du skal følge nu.
Modulerne til Facebook og Instagram er ikke bygget, og de bygges ikke, før du
har besluttet, om du vil søge.

## Kort fortalt

For at hente offentlige opslag fra Facebook-sider og Instagram-konti skal
Meta godkende din app. Godkendelsen er det tunge stykke arbejde — ikke koden.

**Min vurdering:** business-verifikation og eventuelle kontrakter er meget
bagage for en privat tjeneste uden brugere. Hvis du nøjes med de kilder, der
allerede virker, slipper du for hele denne proces. Men beslutningen er din.

## Hvad der kan lade sig gøre — og hvad der ikke kan

| | Understøttes | Understøttes ikke |
| --- | --- | --- |
| Facebook | Offentlige **sider** | Private profiler, grupper, lukkede opslag |
| Instagram | **Business-** og **creator**-konti | Private konti, almindelige privatprofiler |

Private profiler og grupper skal ikke understøttes, og vil ikke blive det.
Det er ikke en teknisk begrænsning, vi arbejder udenom — det er Metas regler
og folks rimelige forventning til privatliv.

## Facebook: Page Public Content Access

Tilladelsen hedder **Page Public Content Access**, forkortet PPCA. Den giver
adgang til at læse offentlige data fra sider, du ikke selv administrerer.

Krav:

- **App Review** skal gennemføres, før appen kan hente rigtige data
- **Business-verifikation** af en virksomhed — det er her, det bliver tungt
  for en privatperson
- Der kan være **yderligere kontrakter**, der skal underskrives, før adgangen
  åbnes

## Instagram: Business Discovery

Funktionen hedder **Business Discovery**. Den virker kun mod business- og
creator-konti.

Krav:

- En **Facebook-side** koblet til en **Instagram business- eller
  creator-konto**
- Tilladelserne `instagram_basic` og typisk `instagram_manage_insights`
- Samme App Review-proces som ovenfor

## Sådan ser ansøgningen ud

1. Opret en app på <https://developers.facebook.com/apps>
2. Tilføj de produkter og tilladelser, du har brug for
3. Gennemfør business-verifikationen — Meta beder om dokumentation for
   virksomheden
4. Udfyld App Review for **hver enkelt tilladelse**:
   - en skriftlig begrundelse for, hvorfor netop den tilladelse er nødvendig
   - en **videooptagelse**, der viser funktionen i brug i din app
   - appen skal være **live og kunne afprøves** af Metas anmelder
5. Vent. Behandlingstiden er typisk nogle hverdage pr. tilladelse, men kan
   trække ud.

### Den typiske grund til afvisning

Meta afprøver, om appen faktisk bruger hver eneste tilladelse, du beder om.
Er en tilladelse med i ansøgningen uden at have en synlig funktion i videoen
eller i begrundelsen, kan **hele** ansøgningen blive afvist. Søg derfor kun om
det, du rent faktisk bruger.

## Hvis du beslutter dig for at søge

Så bygges modulerne bag en afbryder, `META_ENABLED`, der er slået fra som
standard — på samme måde som `PAYMENTS_ENABLED` og `SIGNUPS_ENABLED`. De kan
altså ligge færdige i koden, mens ansøgningen behandles, uden at røre noget.

Sider og konti tilføjes i Airtable-tabellen `Sources` med `Platform` sat til
`facebook` eller `instagram`, ligesom alle andre kilder.

## Kilder

- [Page Public Content Access — Meta for Developers](https://developers.facebook.com/docs/features-reference/page-public-metadata-access/)
- [Permissions Reference — Meta for Developers](https://developers.facebook.com/docs/permissions/)

Oplysningerne her er indhentet 20. september 2026. Metas krav ændrer sig
jævnligt — tjek deres egen dokumentation, inden du går i gang.
