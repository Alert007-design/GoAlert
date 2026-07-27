import { NextRequest, NextResponse } from "next/server";
import { isDanishSource } from "../../cron/scan/sources";

// Diagnose-endpoint. Henter det samme Google News-feed som scannet og viser,
// hvor hvert eneste item bliver af, i stedet for at man skal grave i loggen.
// Læser kun — skriver intet, sender ingen mails.

export const maxDuration = 30;

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get("q") || "Messerschmidt";
  const maxAgeHours = Number(
    req.nextUrl.searchParams.get("timer") || process.env.SCAN_MAX_AGE_HOURS || 24
  );
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    keyword
  )}&hl=da&gl=DK&ceid=DK:da`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, status: res.status, url },
      { status: 500 }
    );
  }

  const xml = await res.text();
  const blocks = xml.split("<item>").slice(1);

  const alle: {
    kilde: string;
    dansk: boolean;
    dato: string | null;
    alderTimer: number | null;
    beholdt: boolean;
    titel: string;
  }[] = [];

  for (const block of blocks) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titleMatch) continue;

    const kilde = sourceMatch ? decodeEntities(sourceMatch[1]) : "(ingen kilde)";
    const dansk = isDanishSource(kilde);
    const d = dateMatch ? new Date(decodeEntities(dateMatch[1])) : null;
    const gyldigDato = !!d && !Number.isNaN(d.getTime());
    const alderTimer = gyldigDato
      ? Math.round(((Date.now() - d!.getTime()) / 3_600_000) * 10) / 10
      : null;

    alle.push({
      kilde,
      dansk,
      dato: gyldigDato ? d!.toISOString() : null,
      alderTimer,
      beholdt: dansk && gyldigDato && d! >= cutoff,
      titel: decodeEntities(titleMatch[1]).slice(0, 90),
    });
  }

  const datoer = alle
    .filter((a) => a.dato)
    .map((a) => new Date(a.dato as string).getTime());

  return NextResponse.json({
    søgeord: keyword,
    vindueTimer: maxAgeHours,
    url,
    antal: {
      iFeed: alle.length,
      danske: alle.filter((a) => a.dansk).length,
      ikkeDanske: alle.filter((a) => !a.dansk).length,
      indenForVindue: alle.filter(
        (a) => a.dato && new Date(a.dato) >= cutoff
      ).length,
      beholdt: alle.filter((a) => a.beholdt).length,
    },
    nyesteIFeed: datoer.length
      ? new Date(Math.max(...datoer)).toISOString()
      : null,
    // Alle kildenavne Google faktisk returnerer, og om isDanishSource
    // genkender dem. Det er her man ser, om filteret er for stramt.
    kilder: Array.from(
      new Map(alle.map((a) => [a.kilde, a.dansk])).entries()
    ).map(([kilde, dansk]) => ({ kilde, dansk })),
    items: alle,
  });
}
