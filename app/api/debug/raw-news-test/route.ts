import { NextResponse } from "next/server";

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

const DOMAINS = [
  "dr.dk", "tv2.dk", "politiken.dk", "jyllands-posten.dk", "berlingske.dk",
  "eb.dk", "bt.dk", "information.dk", "kristeligt-dagblad.dk", "weekendavisen.dk",
  "altinget.dk", "finans.dk", "borsen.dk", "nordjyske.dk", "jv.dk",
  "fyens.dk", "seoghoer.dk", "billedbladet.dk", "femina.dk", "alt.dk",
];

async function testQuery(label: string, q: string) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=da&gl=DK&ceid=DK:da`;
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
    return { label, queryLength: q.length, status: res.status, rawItemCount: itemBlocks.length, rawSources, rawTitles };
  } catch (err) {
    return { label, error: String(err) };
  }
}

export async function GET() {
  const siteClause = "(" + DOMAINS.map((d) => `site:${d}`).join(" OR ") + ")";
  const kendis = await testQuery("kendis + 20 domæner", `kendis ${siteClause}`);
  const trump = await testQuery("Trump + 20 domæner", `Trump ${siteClause}`);
  const foodboldSuperliga = await testQuery("Superligaen + 20 domæner", `Superligaen ${siteClause}`);
  return NextResponse.json({ kendis, trump, foodboldSuperliga });
}
