// Prøvekørsel mod de rigtige nyhedskilder — uden Airtable og uden at sende mails.
//
// Scriptet gør præcis det, scannet gør, bortset fra at "arkivet" over allerede
// sendte omtaler ligger i hukommelsen i stedet for i Airtable. Det gør det
// muligt at afprøve de to ufravigelige krav på ægte data:
//
//   1. Intet i resultatet er ældre end vinduet.
//   2. Anden kørsel i træk giver nul nye omtaler.
//
// Kør:  npx tsx scripts/proevekoersel.ts <søgeord> [flere søgeord...]

import { harvestFeeds } from "../app/api/cron/scan/feeds";
import { matchesKeyword } from "../app/api/cron/scan/matching";
import { enforceWindow, decideWindow, type RawItem } from "../app/api/cron/scan/freshness";
import { dedupeAndGroup } from "../app/api/cron/scan/grouping";

const søgeord = process.argv.slice(2);
if (søgeord.length === 0) søgeord.push("regeringen", "politi");

const runAt = new Date();
const vindue = decideWindow(runAt, null);

async function main() {
console.log(`\nSøgeord: ${søgeord.join(", ")}`);
console.log(`Vindue:  ${vindue.windowStart.toISOString()} → ${runAt.toISOString()}`);
console.log(`         ${vindue.begrundelse}\n`);

const { entries, status } = await harvestFeeds();
const døde = status.filter((s) => !s.ok);
console.log(
  `Kilder:  ${status.length - døde.length}/${status.length} svarede, ${entries.length} indlæg i alt` +
    (døde.length ? ` (uden svar: ${døde.map((d) => d.name).join(", ")})` : "")
);

function indsamlOgFiltrer() {
  const friske: { keyword: string; item: ReturnType<typeof enforceWindow>["fresh"][number] }[] = [];

  for (const ord of søgeord) {
    const rå: RawItem[] = entries
      .filter((e) => matchesKeyword(e.haystack, ord))
      .map((e) => ({
        title: e.title,
        url: e.url,
        source: e.source,
        publishedAt: e.publishedRaw,
        excerpt: e.summary || undefined,
      }));

    const { fresh, kasseret } = enforceWindow(rå, vindue.windowStart, runAt);
    console.log(
      `  "${ord}": ${rå.length} træffere → ${fresh.length} inden for vinduet ` +
        `(${kasseret.forGammelt} for gamle, ${kasseret.udenDato} uden dato)`
    );
    for (const item of fresh) friske.push({ keyword: ord, item });
  }

  return friske;
}

// ---------- Første kørsel ----------
console.log("\n--- Første kørsel ---");
const arkiv = new Set<string>();
const friske1 = indsamlOgFiltrer();
const kørsel1 = dedupeAndGroup(
  friske1.map((f) => f.item),
  arkiv
);

console.log(`\n${kørsel1.grouped.length} nye omtaler (${kørsel1.slåetSammen} slået sammen som samme historie)\n`);
for (const g of kørsel1.grouped.slice(0, 15)) {
  const alder = ((runAt.getTime() - new Date(g.primary.publishedAt).getTime()) / 3_600_000).toFixed(1);
  console.log(`  [${alder.padStart(5)}t] ${g.primary.source}: ${g.primary.title.slice(0, 80)}`);
  if (g.alsoIn.length) console.log(`            også bragt i: ${g.alsoIn.join(", ")}`);
}

// Sådan ville scannet gemme dem: alle medlemmer, også de skjulte.
for (const g of kørsel1.grouped) for (const m of g.members) arkiv.add(m.url);

// ---------- Kontrol af krav 1 ----------
console.log("\n--- Krav 1: intet ældre end vinduet ---");
let ældsteAlder = 0;
let brud = 0;
for (const g of kørsel1.grouped) {
  const udgivet = new Date(g.primary.publishedAt);
  const alderTimer = (runAt.getTime() - udgivet.getTime()) / 3_600_000;
  ældsteAlder = Math.max(ældsteAlder, alderTimer);
  if (udgivet < vindue.windowStart) {
    brud++;
    console.log(`  BRUD: ${g.primary.title.slice(0, 60)} — ${alderTimer.toFixed(1)} timer gammel`);
  }
}
console.log(
  brud === 0
    ? `  OK — ældste omtale er ${ældsteAlder.toFixed(1)} timer gammel, vinduet er 24 timer.`
    : `  ${brud} omtale(r) bryder reglen.`
);

// ---------- Anden kørsel ----------
console.log("\n--- Krav 2: anden kørsel i træk ---");
const friske2 = indsamlOgFiltrer();
const kørsel2 = dedupeAndGroup(
  friske2.map((f) => f.item),
  arkiv
);

console.log(
  kørsel2.grouped.length === 0
    ? `  OK — anden kørsel gav 0 nye omtaler (${kørsel2.sprungetOverKendt} kendt i forvejen).`
    : `  FEJL — anden kørsel gav ${kørsel2.grouped.length} nye omtaler, forventede 0.`
);

process.exit(brud === 0 && kørsel2.grouped.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Prøvekørslen fejlede:", err);
  process.exit(1);
});
