# GDELT: afprøvet og fravalgt

**Beslutning: GDELT er ikke taget i brug.** Koden findes, men er slået fra
(`GDELT_ENABLED`). Dette dokument er begrundelsen, så beslutningen kan
efterprøves i stedet for at skulle huskes.

Afprøvet 20. september 2026.

## Hvad GDELT skulle løse

GDELT var tænkt som erstatning for Google News, der blev droppet, fordi den
leverede norske og forældede resultater. Ideen var en bred nyhedssøgning på
tværs af danske medier.

## Hvad afprøvningen viste

### 1. Den finder ikke dansksproget indhold

Det er den afgørende. Tre målinger, der peger samme vej:

| Forespørgsel | Resultat |
| --- | --- |
| `domain:dr.dk` alene | **17 artikler** — GDELT kender altså dr.dk |
| `"mette frederiksen" domain:dr.dk` over 7 dage | **0 artikler** |
| `"regeringen" domain:dr.dk` over 7 dage | **0 artikler** |

GDELT har dr.dk i sit indeks, men dens fritekstsøgning rammer ikke danske
ord. Sammenhængen er ikke til at misforstå: samme domæne, samme tidsrum — kun
forskellen mellem "intet søgeord" og "et dansk søgeord".

### 2. Uden filter er resultaterne udenlandske

En søgning på `"mette frederiksen"` uden landefilter gav 75 artikler. **Ingen
af dem var på et .dk-domæne.** De var fra `nationalpost.com`,
`oxfordmail.co.uk`, `lbc.co.uk`, `impartialreporter.com` og lignende.

GDELT leverer altså international, engelsksproget dækning *om* Danmark — ikke
dansk dækning. Det er det modsatte af formålet.

`sourcecountry:DA` gav 0 artikler, hver gang den svarede.

### 3. Den er ustabil ved selv let brug

Selv med 5,5 sekunder mellem kaldene svarede GDELT jævnligt med status 429
eller afbrød forbindelsen. Efter en række afprøvninger blev alle kald afvist
i en periode. Adapteren har derfor fået voksende ventetid mellem forsøg —
men en kilde, der skal spørges én gang pr. søgeord pr. dag, bør ikke kræve
den slags.

### 4. Den kender ikke udgivelsesdatoer

GDELT oplyser kun `seendate` — hvornår GDELT selv så artiklen. Ikke hvornår
den blev udgivet.

For det meste ligger de to tæt, fordi GDELT crawler hurtigt. Men ser GDELT en
gammel artikel igen — efter en omlægning, en genudgivelse eller bare en ny
crawl — får den en frisk dato. **En artikel fra 2019 kan se ud, som om den er
fra i dag.**

Det er præcis det, 24-timers-reglen skal forhindre. Selv hvis punkt 1 til 3
blev løst, ville dette punkt alene kræve en beslutning om, hvorvidt
"hvornår vi så den" er godt nok som erstatning for "hvornår den udkom".

## Hvad der blev bygget alligevel

Tre ting blev tilbage, fordi de har værdi uanset GDELT:

- **Den danske kildekontrol** (`danske-kilder.ts`). En stram kontrol, der kun
  godkender `.dk`-domæner og en udtrykkelig liste. Den stoler ikke på, hvad en
  udbyder selv påstår om landet — netop den tillid gjorde Google News
  ubrugelig. Dækket af tests, der fejler, hvis så meget som ét norsk eller
  svensk domæne slipper igennem.
- **GDELT-adapteren** (`gdelt.ts`), slået fra. Kan tændes uden at skulle
  skrives forfra, hvis GDELT ændrer sig.
- **Afprøvningsværktøjet**: `scripts/tjek-gdelt.ts` og `/api/debug/gdelt`, der
  begge beviser det samme — at ingen udenlandsk kilde slipper igennem.

## Sådan afprøver du det selv

Lokalt:

```
npx tsx scripts/tjek-gdelt.ts "mette frederiksen"
npx tsx scripts/tjek-gdelt.ts --filter="" --timer=168 "mette frederiksen"
npx tsx scripts/tjek-gdelt.ts --filter=domain:dr.dk --timer=168 "regeringen"
```

Fra Vercel, hvor IP-adresserne er andre:

```
GET /api/debug/gdelt?q=mette%20frederiksen&timer=24
```

Svaret indeholder feltet `beviset.bestået`. Er det `false`, er en udenlandsk
kilde sluppet igennem, og kilden må ikke tændes.

## Hvis den skal tages op igen

Den skal vise noget andet end ovenstående, før den tændes:

1. En søgning på et dansk ord skal give danske artikler.
2. Artiklerne skal bestå vores egen danske kontrol — ikke GDELT's.
3. Der skal tages stilling til, om `seendate` er god nok som udgivelsesdato.

Først derefter sættes `GDELT_ENABLED=true`.
