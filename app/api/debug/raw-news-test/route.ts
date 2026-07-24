import { NextResponse } from "next/server";

// Midlertidig diagnose-route: tester om en Accept-Language-header får Google
// News til at respektere dansk sprog/land, i stedet for at geo-gætte ud fra
// serverens IP-adresse (som gav norske resultater).
//
// Slet denne fil igen, når fejlen er fundet og løst.
const QUERY = "kendis";

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

async function testVariant(label: string, headers: Record<string, string>) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    QUERY
  )}&hl=da&gl=DK&ceid=DK:da`;
  try {
    const res = await fetch(url, { headers });
    const xml = res.ok ? await res.text() : "";
    const linkMatch = xml.match(/<link>([\s\S]*?)<\/link>/);
    const itemBlocks = xml.split("<item>").slice(1);
    const rawSources = itemBlocks.slice(0, 10).map((block) => {
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      return sourceMatch ? decodeEntities(sourceMatch[1]) : "(intet source-tag)";
    });
    return {
      label,
      status: res.status,
      feedLink: linkMatch ? decodeEntities(linkMatch[1]) : null,
      rawItemCount: itemBlocks.length,
      rawSources,
    };
  } catch (err) {
    return { label, error: String(err) };
  }
}

export async function GET() {
  const noHeader = await testVariant("uden Accept-Language", {});
  const withHeader = await testVariant("med Accept-Language: da-DK", {
    "Accept-Language": "da-DK,da;q=0.9",
  });
  return NextResponse.json({ noHeader, withHeader });
}
