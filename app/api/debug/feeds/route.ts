import { NextRequest, NextResponse } from "next/server";
import { harvestFeeds, FEEDS } from "../../cron/scan/feeds";
import { matchesKeyword } from "../../cron/scan/matching";
import { kræverHemmelighed } from "../../_lib/auth";

// Sundhedstjek af nyhedskilderne. Henter alle feeds og viser, hvilke der
// svarer, hvor mange indlæg de leverer, og hvor friske de er.
// Læser kun — skriver intet, sender ingen mails.
//
// Valgfrit: ?q=søgeord viser desuden hvilke artikler der ville blive fundet.

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const afvist = kræverHemmelighed(req);
  if (afvist) return afvist;

  const keyword = req.nextUrl.searchParams.get("q");
  const timer = Number(req.nextUrl.searchParams.get("timer") || 24);
  const cutoff = new Date(Date.now() - timer * 60 * 60 * 1000);

  const { entries, status } = await harvestFeeds(true);

  const virkende = status.filter((s) => s.ok);
  const døde = status.filter((s) => !s.ok);
  const friske = entries.filter((e) => e.published !== null && e.published >= cutoff);

  const svar: Record<string, unknown> = {
    opsummering: {
      kilderIAlt: FEEDS.length,
      svarede: virkende.length,
      fejlede: døde.length,
      indlægIAlt: entries.length,
      indenForVindue: friske.length,
      vindueTimer: timer,
    },
    virker: virkende.map((s) => ({
      kilde: s.name,
      antal: s.antal,
      nyeste: s.nyeste,
    })),
    fejler: døde.map((s) => ({
      kilde: s.name,
      url: s.url,
      status: s.status,
      fejl: s.fejl,
    })),
  };

  if (keyword) {
    // Samme matchning som i scannet: hele ord, ikke delstrenge.
    const træffere = friske
      .filter((e) => matchesKeyword(e.haystack, keyword))
      .sort((a, b) => (b.published as Date).getTime() - (a.published as Date).getTime())
      .map((e) => ({
        kilde: e.source,
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
