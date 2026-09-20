// Afprøver GDELT mod virkeligheden.
//
// Scriptet beviser to ting, eller fejler:
//   1. At ingen udenlandsk kilde slipper igennem vores danske kontrol.
//   2. Hvor friskt indholdet reelt er — GDELT oplyser kun, hvornår den SÅ
//      artiklen, ikke hvornår den blev udgivet.
//
// Kør:  npx tsx scripts/tjek-gdelt.ts "mette frederiksen" klima

import { søgGdelt, landefilter, byggeQuery } from "../app/api/cron/scan/gdelt";
import { erDanskKilde } from "../app/api/cron/scan/danske-kilder";

const args = process.argv.slice(2);

// --filter=... afprøver en anden skrivemåde af landefilteret, fx
// --filter="sourcecountry:denmark" eller --filter="" for slet intet filter.
const filterArg = args.find((a) => a.startsWith("--filter="));
const filter = filterArg === undefined ? landefilter() : filterArg.slice("--filter=".length);

// --timer=48 udvider vinduet.
const timerArg = args.find((a) => a.startsWith("--timer="));
const VINDUE_TIMER = timerArg ? Number(timerArg.slice("--timer=".length)) : 24;

const søgeord = args.filter((a) => !a.startsWith("--"));
if (søgeord.length === 0) søgeord.push("mette frederiksen");

async function main() {
  const windowStart = new Date(Date.now() - VINDUE_TIMER * 3_600_000);
  let fejl = 0;
  let ialtDanske = 0;

  console.log(`\nVindue: seneste ${VINDUE_TIMER} timer`);
  console.log(`Filter: ${filter ? filter : "(intet)"}`);
  console.log(`Eksempel på forespørgsel: ${byggeQuery(søgeord[0], filter)}\n`);

  for (const ord of søgeord) {
    console.log(`=== "${ord}" ===`);

    let resultat;
    try {
      resultat = await søgGdelt(ord, windowStart, filter);
    } catch (err: any) {
      console.log(`  KUNNE IKKE SØGE: ${err?.message || err}\n`);
      fejl++;
      continue;
    }

    console.log(`  GDELT leverede : ${resultat.leveret}`);
    console.log(`  Danske tilbage : ${resultat.items.length}`);
    console.log(`  Afvist         : ${resultat.afvist.length}`);

    if (resultat.afvist.length > 0) {
      const opsummering = new Map<string, number>();
      for (const a of resultat.afvist) {
        opsummering.set(a.grund, (opsummering.get(a.grund) || 0) + 1);
      }
      for (const [grund, antal] of opsummering) {
        console.log(`     - ${antal}× ${grund}`);
      }
    }

    // BEVISET: hver eneste tilbageværende artikel skal være dansk.
    for (const item of resultat.items) {
      if (!erDanskKilde(item.url)) {
        console.log(`  BRUD: ikke-dansk kilde slap igennem — ${item.url}`);
        fejl++;
      }
    }

    // Hvor gammelt er det, GDELT kalder friskt?
    const aldre = resultat.items
      .map((i) => (i.publishedAt ? (Date.now() - new Date(i.publishedAt).getTime()) / 3_600_000 : null))
      .filter((a): a is number => a !== null);

    if (aldre.length) {
      const ældste = Math.max(...aldre);
      console.log(`  Ældste "set"   : ${ældste.toFixed(1)} timer siden`);
    }

    for (const item of resultat.items.slice(0, 5)) {
      console.log(`     · ${item.publishedAt || "(ingen dato)"}  ${item.title.slice(0, 70)}`);
      console.log(`       ${item.source}`);
    }

    ialtDanske += resultat.items.length;
    console.log("");
  }

  if (fejl > 0) {
    console.log(`FEJLET: ${fejl} problem(er). GDELT må ikke tændes.`);
    process.exit(1);
  }

  console.log(`Bestået: ${ialtDanske} danske artikler, ingen udenlandske slap igennem.`);
  console.log(
    "\nHusk: datoerne er tidspunktet GDELT SÅ artiklen, ikke hvornår den blev\n" +
      "udgivet. Se advarslen nederst i app/api/cron/scan/gdelt.ts."
  );
}

main().catch((err) => {
  console.error("Afprøvningen fejlede:", err);
  process.exit(1);
});
