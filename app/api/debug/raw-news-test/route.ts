import { NextResponse } from "next/server";

// Midlertidig diagnose-route: viser de RÅ resultater fra Google News (før
// det danske kildefilter), så vi kan se om søgningen reelt finder noget,
// og hvilke kilder der i givet fald bliver filtreret væk.
//
// Slet denne fil igen, når fejlen er fundet og løst.
const QUERIES = ["kendis", "fodbold Superligaen"];

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

export async function GET() {
  const results: Record<string, any> = {};

  for (const q of QUERIES) {
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
        rawSources.push(sourceMatch ? decodeEntities(sourceMatch[1]) : "(intet source-tag)");
      }
      results[q] = {
        status: res.status,
        ok: res.ok,
        xmlLength: xml.length,
        rawItemCount: itemBlocks.length,
        rawSources,
        rawTitles,
        xmlPreview: xml.slice(0, 300),
      };
    } catch (err) {
      results[q] = { error: String(err) };
    }
  }

  return NextResponse.json(results);
}
