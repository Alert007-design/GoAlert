import { NextResponse } from "next/server";

// Midlertidig diagnose-route: tester om "site:"-operatoren kan tvinge
// resultater fra specifikke danske domæner, uanset Googles geo-gæt på
// sprog/land (som vi lige har bekræftet ignorerer både URL-parametre og
// Accept-Language-headeren).
//
// Slet denne fil igen, når fejlen er fundet og løst.

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

async function testQuery(label: string, q: string) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    q
  )}&hl=da&gl=DK&ceid=DK:da`;
  try {
    const res = await fetch(url);
    const xml = res.ok ? await res.text() : "";
    const itemBlocks = xml.split("<item>").slice(1);
    const rawSources: string[] = [];
    const rawTitles: string[] = [];
    for (const block of itemBlocks.slice(0, 10)) {
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      if (titleMatch) rawTitles.push(decodeEntities(titleMatch[1]));
      rawSources.push(sourceMatch ? decodeEntities(sourceMatch[1]) : "(intet)");
    }
    return { label, query: q, status: res.status, rawItemCount: itemBlocks.length, rawSources, rawTitles };
  } catch (err) {
    return { label, error: String(err) };
  }
}

export async function GET() {
  const a = await testQuery("kendis + ét dansk site", "kendis site:eb.dk");
  const b = await testQuery(
    "kendis + flere danske sites (OR)",
    "kendis (site:eb.dk OR site:seoghoer.dk OR site:billedbladet.dk OR site:dr.dk)"
  );
  const c = await testQuery("almindelig kendis (uden site)", "kendis");
  return NextResponse.json({ a, b, c });
}
