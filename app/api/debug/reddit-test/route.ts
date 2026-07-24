import { NextResponse } from "next/server";

// Midlertidig diagnose-route: viser Reddits rå svar (statuskode + starten af
// svarteksten), så vi kan se præcis hvorfor fetchReddit() fejler, uden at
// skulle lede efter console.error-linjer i Vercels logs.
//
// Slet denne fil igen, når fejlen er fundet og løst — den er ikke tænkt
// som en permanent del af API'en.
export async function GET() {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
    "test"
  )}&sort=new&limit=5`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "gossip-alert-bot/1.0" },
    });
    const bodyText = await res.text();
    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      bodyPreview: bodyText.slice(0, 500),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
