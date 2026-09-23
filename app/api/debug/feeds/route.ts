import { NextRequest, NextResponse } from "next/server";
import { feedRækkevidde, harvestFeeds } from "../../cron/scan/feeds";
import { matchesKeyword } from "../../cron/scan/matching";
import { updateSourceStatus } from "../../cron/scan/sources-table";
import { kræverHemmelighed } from "../../_lib/auth";

// Kildetjek. Henter alle aktive kilder og viser, hvilke der svarer, hvor
// mange indlæg de leverer, og hvor friske de er.
//
// Ruten er bygget til at kunne køres FRA VERCEL, ikke kun lokalt. Det er
// pointen: Vercel har andre IP-adresser end en privat forbindelse, og flere
// tjenester behandler datacentre anderledes. En kilde, der svarer hjemmefra,
// kan være blokeret i drift — og det er driften, der tæller.
//
// Læser som udgangspunkt kun. Sender aldrig mails.
//
// Parametre:
//   ?q=søgeord   viser desuden hvilke artikler der ville blive fundet
//   ?timer=48    ændrer tidsvinduet i visningen (standard 24)
//   ?gem=1       skriver LastStatus, LastChecked og LastItemCount tilbage
//                i Airtable-tabellen Sources

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const afvist = kræverHemmelighed(req);
  if (afvist) return afvist;

  const keyword = req.nextUrl.searchParams.get("q");
  const timer = Number(req.nextUrl.searchParams.get("timer") || 24);
  const skalGemme = req.nextUrl.searchParams.get("gem") === "1";
  const cutoff = new Date(Date.now() - timer * 60 * 60 * 1000);

  const { entries, status, fraTabel, kildeBegrundelse } = await harvestFeeds(true);

  const virkende = status.filter((s) => s.ok);
  const døde = status.filter((s) => !s.ok);
  const friske = entries.filter((e) => e.published !== null && e.published >= cutoff);

  // Skriv resultatet tilbage, så status kan ses i Airtable uden at grave i
  // loggen. Kun rækker der faktisk kommer fra tabellen har et id at skrive til.
  let gemt = 0;
  let gemFejl = 0;
  if (skalGemme) {
    const tidspunkt = new Date();
    for (const s of status) {
      if (!s.id) continue;
      const ok = await updateSourceStatus(s.id, {
        status: s.ok ? `OK — ${s.antal} indlæg` : `FEJL — ${s.fejl || "ukendt"}`,
        checked: tidspunkt,
        itemCount: s.antal,
      });
      if (ok) gemt++;
      else gemFejl++;
    }
  }

  const svar: Record<string, unknown> = {
    kildeliste: {
      fraAirtable: fraTabel,
      forklaring: kildeBegrundelse,
    },
    opsummering: {
      kilderIAlt: status.length,
      svarede: virkende.length,
      fejlede: døde.length,
      indlægIAlt: entries.length,
      indenForVindue: friske.length,
      vindueTimer: timer,
    },
    // De kilder, der rækker kortere tilbage end vinduet, er dem der når at
    // rulle forbi mellem to kørsler. Står en kilde her, er en tavs dag ikke
    // nødvendigvis en rolig dag.
    ruller_forbi: feedRækkevidde(status, new Date(), timer).map((u) => ({
      kilde: u.navn,
      rækkerTilbageTimer: Number(u.timer.toFixed(1)),
    })),
    virker: virkende.map((s) => ({
      kilde: s.name,
      platform: s.platform,
      antal: s.antal,
      nyeste: s.nyeste,
      ældste: s.ældste,
    })),
    fejler: døde.map((s) => ({
      kilde: s.name,
      platform: s.platform,
      url: s.url,
      status: s.status,
      fejl: s.fejl,
    })),
  };

  if (skalGemme) {
    svar.statusGemt = {
      opdateredeRækker: gemt,
      fejlede: gemFejl,
      bemærkning: fraTabel
        ? undefined
        : "Kildelisten kom fra reservelisten i koden, så der var ingen rækker at skrive til.",
    };
  }

  if (keyword) {
    // Samme matchning som i scannet: hele ord, ikke delstrenge.
    const træffere = friske
      .filter((e) => matchesKeyword(e.haystack, keyword))
      .sort((a, b) => (b.published as Date).getTime() - (a.published as Date).getTime())
      .map((e) => ({
        kilde: e.source,
        platform: e.platform,
        dato: (e.published as Date).toISOString(),
        titel: e.title.slice(0, 120),
        url: e.url,
      }));

    svar.søgeord = keyword;
    svar.træffere = {
      antal: træffere.length,
      artikler: træffere.slice(0, 25),
    };
  }

  return NextResponse.json(svar);
}
