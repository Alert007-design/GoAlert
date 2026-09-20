# Sådan tilføjer du en kilde

Kilderne styres fra Airtable-tabellen `Sources`. Du tilføjer en kilde ved at
oprette en række — der skal ikke ændres i kode.

**Afprøv altid adressen først.** En adresse, der ikke virker, fejler i
stilhed, hvis den bare bliver skrevet ind:

```
npx tsx scripts/tjek-kilder.ts --vis https://adressen-du-vil-tilfoeje
```

`--vis` viser de første indlæg, som scannet ville læse dem. Det er forskellen
på "kilden svarede" og "kilden leverer noget brugbart".

Udfyld derefter rækken:

| Kolonne | Værdi |
| --- | --- |
| `Name` | Det navn, du vil se i mailen |
| `Platform` | Se tabellen nedenfor |
| `Type` | `feed` |
| `URL` | Adressen |
| `Active` | Flueben |

De tre sidste kolonner udfyldes af systemet selv.

## Platformene

| Platform | Hvad det er |
| --- | --- |
| `rss` | Almindelige nyhedsfeeds, blogs, podcasts, Google Alerts |
| `youtube` | En YouTube-kanals videoer |
| `mastodon` | En Mastodon-profil eller et hashtag |
| `bluesky` | En Bluesky-profil |
| `wikipedia` | Ændringer i én Wikipedia-artikel |

`Platform` bruges til at vise, hvor en omtale kommer fra — og for Wikipedia
udløser den en særlig behandling, se nedenfor. Alle platforme er underlagt
præcis de samme regler om 24 timer og ingen gentagelser.

---

## YouTube

Adressen er:

```
https://www.youtube.com/feeds/videos.xml?channel_id=KANAL_ID
```

**Sådan finder du kanalens id:**

1. Åbn kanalens side på YouTube
2. Højreklik et tomt sted på siden og vælg **Vis kildekode** (eller
   **View page source**)
3. Tryk Ctrl+F og søg efter `channelId`
4. Kopiér værdien — den starter med `UC` og er 24 tegn lang

Et kanalnavn som `@dr` virker **ikke** i adressen. Det skal være id'et.

Afprøv derefter:

```
npx tsx scripts/tjek-kilder.ts --vis "https://www.youtube.com/feeds/videos.xml?channel_id=UC..."
```

Videoens titel og beskrivelse gennemsøges begge for dine søgeord.

---

## Mastodon

**En profil:**

```
https://SERVER/@BRUGERNAVN.rss
```

Eksempel: `https://mastodon.social/@Gargron.rss`

Serveren er den del, der står efter det andet `@` i en fuld Mastodon-adresse.
Hedder nogen `@navn@mastodon.social`, er serveren `mastodon.social`.

**Et hashtag:**

```
https://SERVER/tags/HASHTAG.rss
```

Eksempel: `https://mastodon.social/tags/denmark.rss`

Et hashtag-feed viser opslag fra hele Mastodon-netværket, ikke kun fra den
server, du spørger. Vælg en stor server for at få mest med.

**Bemærk:** opslag på Mastodon har ingen overskrift. Systemet bruger derfor
begyndelsen af opslaget som titel i mailen og gennemsøger hele teksten.

---

## Bluesky

```
https://bsky.app/profile/BRUGERNAVN/rss
```

Eksempel: `https://bsky.app/profile/bsky.app/rss`

Brugernavnet er det, der står i profilens adresse — typisk noget i stil med
`navn.bsky.social`.

**Søgning på tværs af Bluesky understøttes ikke.** Deres åbne søge-API
afviser forespørgsler uden login (fejl 403 ved afprøvning 20/9 2026), og der
bygges ingen omvej udenom. Du kan altså følge bestemte profiler, men ikke
søge i hele Bluesky.

---

## Wikipedia

Overvåger ændringer i **én bestemt artikel**:

```
https://da.wikipedia.org/w/index.php?title=ARTIKELNAVN&action=history&feed=atom
```

Eksempel:
`https://da.wikipedia.org/w/index.php?title=Mette_Frederiksen&action=history&feed=atom`

Brug `en.wikipedia.org` for den engelske udgave. Mellemrum i artiklens navn
skrives som understreg: `Mette_Frederiksen`.

**Dette er den ene platform med en særregel.** Wikipedias historik-feed
fortæller kun, *hvad* der blev rettet — ikke hvilken artikel det var. Overvåger
du dit eget navn, ville en rettelse i din egen artikel derfor ikke give en
omtale, medmindre dit navn tilfældigvis stod i den ændrede tekst.

Derfor henter systemet artiklens navn ud af adressen og lægger det til det
felt, der gennemsøges. Enhver rettelse i artiklen giver dermed en omtale,
hvilket er hele formålet med at overvåge den. **Det virker kun, når `Platform`
er sat til `wikipedia`.**

Vær opmærksom på, at en del rettelser er automatiske bot-rettelser af links.
De tæller også som omtaler.

---

## Google Alerts

Google Alerts kan levere et RSS-feed, som du kan sætte ind som en almindelig
kilde.

1. Gå til <https://www.google.com/alerts>
2. Opret din alert
3. Klik på tandhjulet ved alerten og vælg **RSS-feed** som leveringsmetode
4. Kopiér feed-adressen

Sæt `Platform` til `rss`.

---

## Podcasts

Et podcast-feed er et almindeligt RSS-feed. Find adressen hos udbyderen og
sæt `Platform` til `rss`. Titel og beskrivelse på hver episode gennemsøges.

---

## Det, der ikke understøttes

| | Hvorfor |
| --- | --- |
| X, LinkedIn, TikTok | Skal ikke med |
| Reddit | Kræver godkendelse fra Reddit — se [reddit-ansoegning.md](reddit-ansoegning.md) |
| Bluesky-søgning | Deres søge-API kræver login |
| Facebook, Instagram | Kræver godkendelse fra Meta — se [meta-ansoegning.md](meta-ansoegning.md) |
| Private profiler og grupper | Skal ikke understøttes |

Adresser, der **er** afprøvet og ikke virker, står i `AFPRØVET_UDEN_HELD` i
`app/api/cron/scan/anbefalede-kilder.ts` — med grunden til hver. Kig der,
før du bruger tid på en kilde, der allerede er opgivet.
