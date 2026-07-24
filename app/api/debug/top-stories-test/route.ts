import { NextResponse } from "next/server";
import { fetchNews } from "../../cron/scan/sources";

// Midlertidig diagnose-route: tester de fire søgeord, som "Danmark lige
// nu"-panelet bruger, direkte igennem den samme (danske-filtrerede)
// fetchNews-funktion, som scan-jobbet også bruger. Viser hvor mange
// resultater hvert søgeord reelt giver i produktion.
//
// Slet denne fil igen, når fejlen er fundet og løst.
const QUERIES = ["kendis", "reality", "fodbold Superligaen", "underholdning"];

export async function GET() {
  const results: Record<string, any> = {};

  for (const q of QUERIES) {
    try {
      const items = await fetchNews(q);
      results[q] = {
        count: items.length,
        sources: items.map((i) => i.source),
        firstTitles: items.slice(0, 3).map((i) => i.title),
      };
    } catch (err) {
      results[q] = { error: String(err) };
    }
  }

  return NextResponse.json(results);
}
