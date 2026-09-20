import { NextRequest, NextResponse } from "next/server";
import { søgGdelt, isGdeltEnabled, byggeQuery } from "../../cron/scan/gdelt";
import { erDanskKilde } from "../../cron/scan/danske-kilder";
import { kræverHemmelighed } from "../../_lib/auth";

// Afprøver GDELT fra Vercel.
//
// Hele grunden til, at denne rute findes: Vercel har andre IP-adresser end en
// privat forbindelse, og GDELT opførte sig ustabilt ved afprøvning hjemmefra.
// Det skal måles fra driften, ikke antages.
//
// Ruten beviser det samme som scripts/tjek-gdelt.ts: at ingen udenlandsk
// kilde slipper igennem. Den skriver intet og sender ingen mails.
//
//   GET /api/debug/gdelt?q=søgeord
//   GET /api/debug/gdelt?q=søgeord&timer=48

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const afvist = kræverHemmelighed(req);
  if (afvist) return afvist;

  const keyword = req.nextUrl.searchParams.get("q") || "mette frederiksen";
  const timer = Number(req.nextUrl.searchParams.get("timer") || 24);
  const windowStart = new Date(Date.now() - timer * 3_600_000);

  let resultat;
  try {
    resultat = await søgGdelt(keyword, windowStart);
  } catch (err: any) {
    return NextResponse.json(
      {
        søgeord: keyword,
        slåetTil: isGdeltEnabled(),
        forespørgsel: byggeQuery(keyword),
        fejl: String(err?.message || err),
        vurdering:
          "GDELT kunne ikke svare. Kilden må ikke tændes, før den svarer pålideligt herfra.",
      },
      { status: 502 }
    );
  }

  // Selve beviset: er der noget ikke-dansk tilbage efter vores egen kontrol?
  const brud = resultat.items.filter((i) => !erDanskKilde(i.url));

  const afvistPrGrund: Record<string, number> = {};
  for (const a of resultat.afvist) {
    afvistPrGrund[a.grund] = (afvistPrGrund[a.grund] || 0) + 1;
  }

  const aldre = resultat.items
    .map((i) => (i.publishedAt ? (Date.now() - new Date(i.publishedAt).getTime()) / 3_600_000 : null))
    .filter((a): a is number => a !== null);

  return NextResponse.json({
    søgeord: keyword,
    slåetTil: isGdeltEnabled(),
    forespørgsel: byggeQuery(keyword),
    vindueTimer: timer,
    resultat: {
      gdeltLeverede: resultat.leveret,
      danskeTilbage: resultat.items.length,
      afvist: resultat.afvist.length,
      afvistPrGrund,
    },
    beviset: {
      ikkeDanskeSlapIgennem: brud.length,
      bestået: brud.length === 0,
      brud: brud.map((b) => b.url),
    },
    ældsteSetTimerSiden: aldre.length ? Math.max(...aldre) : null,
    eksempler: resultat.items.slice(0, 10).map((i) => ({
      titel: i.title.slice(0, 100),
      kilde: i.source,
      set: i.publishedAt,
      url: i.url,
    })),
    forbehold:
      "Datoerne er tidspunktet, GDELT SÅ artiklen — ikke hvornår den blev udgivet. " +
      "En gammel artikel, der bliver crawlet igen, får en frisk dato.",
  });
}
