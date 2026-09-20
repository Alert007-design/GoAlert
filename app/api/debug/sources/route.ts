import { NextRequest, NextResponse } from "next/server";
import { getAllSources, addSources } from "../../cron/scan/sources-table";
import { ANBEFALEDE_KILDER, AFPRØVET_UDEN_HELD } from "../../cron/scan/anbefalede-kilder";
import { normalizeUrl } from "../../cron/scan/urls";
import { kræverHemmelighed } from "../../_lib/auth";

// Fylder Airtable-tabellen "Sources" op med de anbefalede kilder.
//
// Ruten kører FRA VERCEL, hvor Airtable-nøglen findes. Den er bygget til at
// kunne køres igen og igen uden at lave rod:
//
//   - Der tilføjes kun kilder, tabellen ikke har i forvejen.
//   - Der sammenlignes på normaliseret adresse, så www/http/skråstreg ikke
//     narrer den til at oprette en dublet.
//   - Eksisterende rækker ændres ALDRIG, og der slettes aldrig noget.
//   - En kilde, du bevidst har slået fra i Airtable, bliver ikke tilføjet
//     igen — den tæller stadig som "findes".
//
// Uden ?tilfoej=1 viser den kun, hvad der VILLE ske. Det er med vilje: det
// skal være muligt at se forskellen, før man rører ved data.

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const afvist = kræverHemmelighed(req);
  if (afvist) return afvist;

  const skalTilføje = req.nextUrl.searchParams.get("tilfoej") === "1";

  const nuværende = await getAllSources();

  if (!nuværende) {
    return NextResponse.json(
      {
        error: "Kunne ikke læse tabellen Sources",
        besked:
          "Tjek at tabellen hedder præcis 'Sources', og at AIRTABLE_TOKEN og " +
          "AIRTABLE_BASE_ID er sat i Vercel. Se README for kolonner og felttyper.",
      },
      { status: 502 }
    );
  }

  const findes = new Set(nuværende.kilder.map((k) => normalizeUrl(k.url)));

  const manglende = ANBEFALEDE_KILDER.filter((k) => !findes.has(normalizeUrl(k.url)));

  // Kilder du selv har tilføjet, som ikke står på den anbefalede liste.
  // De vises kun til orientering — de røres aldrig.
  const anbefaledeUrls = new Set(ANBEFALEDE_KILDER.map((k) => normalizeUrl(k.url)));
  const dineEgne = nuværende.kilder
    .filter((k) => !anbefaledeUrls.has(normalizeUrl(k.url)))
    .map((k) => ({ navn: k.name, platform: k.platform, url: k.url }));

  const svar: Record<string, unknown> = {
    tilstand: skalTilføje ? "tilføjede kilder" : "viser kun hvad der ville ske",
    tabellen: {
      rækkerIAlt: nuværende.kilder.length,
      aktive: nuværende.aktiv.filter(Boolean).length,
      slåetFra: nuværende.aktiv.filter((a) => !a).length,
    },
    manglerIAlt: manglende.length,
    manglende: manglende.map((k) => ({
      navn: k.name,
      platform: k.platform,
      type: k.type,
      url: k.url,
      bekræftet: k.bekræftet,
    })),
    dineEgneKilder: dineEgne,
    afprøvetUdenHeld: AFPRØVET_UDEN_HELD,
  };

  if (!skalTilføje) {
    svar.sådanTilføjerDu =
      manglende.length > 0
        ? "Kald den samme adresse igen med ?tilfoej=1 for at oprette de manglende rækker."
        : "Der er ingenting at tilføje — tabellen har allerede alle anbefalede kilder.";
    return NextResponse.json(svar);
  }

  if (manglende.length === 0) {
    svar.resultat = "Ingenting at tilføje.";
    return NextResponse.json(svar);
  }

  const { tilføjet, fejl } = await addSources(
    manglende.map((k) => ({ name: k.name, platform: k.platform, type: k.type, url: k.url }))
  );

  svar.resultat = {
    tilføjede: tilføjet,
    fejlede: fejl.length,
    fejl: fejl.length ? fejl : undefined,
  };

  return NextResponse.json(svar);
}
