// Afprøver kilder med rigtige kald, før de tages i brug.
//
// Reglen i projektet er, at en feed-adresse aldrig må gættes. Dette script er
// måden at efterprøve det på. Det bruger den SAMME parser som selve scannet,
// så "virker her" betyder "virker i scannet" — ikke bare "serveren svarede".
//
// Kør uden argumenter for at tjekke hele den anbefalede liste:
//     npx tsx scripts/tjek-kilder.ts
//
// Eller giv en eller flere adresser for at afprøve kandidater:
//     npx tsx scripts/tjek-kilder.ts https://eksempel.dk/rss
//
// Tilføj --vis for også at se de første indlæg, som scannet ville læse dem.
// Det er forskellen på "kilden svarede" og "kilden leverer noget brugbart":
//     npx tsx scripts/tjek-kilder.ts --vis https://eksempel.dk/rss
//
// Afslutter med fejlkode, hvis en kilde ikke svarer med læsbare indlæg, så
// det kan bruges som en kontrol og ikke bare en udskrift.

import { parseFeed } from "../app/api/cron/scan/feeds";
import { ANBEFALEDE_KILDER } from "../app/api/cron/scan/anbefalede-kilder";

type Prøve = { navn: string; url: string };

const TIMEOUT_MS = 20000;

const VIS_ANTAL = 3;

async function tjek(p: Prøve, vis: boolean) {
  const t0 = Date.now();
  try {
    const res = await fetch(p.url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "User-Agent": "GossipAlert/1.0 (+https://gossipalert.dk)",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });

    const ms = Date.now() - t0;

    if (!res.ok) {
      return { ...p, ok: false, antal: 0, ms, note: `HTTP ${res.status}` };
    }

    const xml = await res.text();
    const entries = parseFeed(xml, p.navn);

    if (entries.length === 0) {
      const ct = (res.headers.get("content-type") || "").split(";")[0];
      return {
        ...p,
        ok: false,
        antal: 0,
        ms,
        note: `svarede (${ct}), men ingen læsbare indlæg`,
      };
    }

    // Hvor frisk er det nyeste indlæg? En kilde, der svarer med indhold fra
    // sidste år, er teknisk set i live, men ubrugelig til daglig overvågning.
    const tider = entries
      .map((e) => e.published?.getTime())
      .filter((t): t is number => typeof t === "number");
    const nyeste = tider.length ? Math.max(...tider) : null;
    const alderTimer = nyeste ? (Date.now() - nyeste) / 3_600_000 : null;

    const eksempler = vis
      ? entries.slice(0, VIS_ANTAL).map((e) => ({
          titel: e.title,
          url: e.url,
          dato: e.published?.toISOString() || "(ingen)",
          uddrag: e.summary.slice(0, 100),
        }))
      : [];

    return {
      ...p,
      ok: true,
      antal: entries.length,
      ms,
      note: alderTimer === null ? "ingen datoer" : `nyeste ${alderTimer.toFixed(1)}t siden`,
      eksempler,
    };
  } catch (err: any) {
    return { ...p, ok: false, antal: 0, ms: Date.now() - t0, note: String(err?.message || err) };
  }
}

async function main() {
  const alleArgs = process.argv.slice(2);
  const vis = alleArgs.includes("--vis");
  const args = alleArgs.filter((a) => a !== "--vis");

  const prøver: Prøve[] = args.length
    ? args.map((url) => ({ navn: new URL(url).hostname, url }))
    : ANBEFALEDE_KILDER.map((k) => ({ navn: k.name, url: k.url }));

  console.log(`\nAfprøver ${prøver.length} kilde(r) med rigtige kald…\n`);

  const resultater = await Promise.all(prøver.map((p) => tjek(p, vis)));
  resultater.sort((a, b) => Number(a.ok) - Number(b.ok) || a.navn.localeCompare(b.navn));

  for (const r of resultater) {
    console.log(
      `${r.ok ? "OK  " : "FEJL"} | ${r.navn.padEnd(26)} | ${String(r.antal).padStart(3)} indlæg | ${String(r.ms).padStart(5)}ms | ${r.note}`
    );
    if (!r.ok) console.log(`       ${r.url}`);

    for (const e of (r as any).eksempler || []) {
      console.log(`       · ${e.dato}  ${e.titel.slice(0, 90)}`);
      console.log(`         ${e.url}`);
    }
  }

  const virker = resultater.filter((r) => r.ok).length;
  console.log(`\n${virker}/${resultater.length} svarede med læsbare indlæg`);

  if (virker < resultater.length) {
    console.log(
      "\nKilder der ikke svarer, skal rettes eller fjernes — de må ikke stå\n" +
        "i den anbefalede liste, hvor de ser bekræftede ud."
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Kildetjekket fejlede:", err);
  process.exit(1);
});
