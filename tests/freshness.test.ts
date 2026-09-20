// Beviser krav 1: intet ældre end vinduet må komme med i mailen.
//
// Testene kalder den samme funktion, som scannet bruger. Ændrer nogen
// aldersreglen — eller tilføjer en ny kilde, der sniger sig uden om den —
// fejler testene, og build stopper.

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideWindow, enforceWindow, type RawItem } from "../app/api/cron/scan/freshness";
import { parsePublishedAt } from "../app/api/cron/scan/dates";

const runAt = new Date("2026-09-20T09:00:00Z");
const windowStart = new Date("2026-09-19T09:00:00Z");

function item(overrides: Partial<RawItem>): RawItem {
  return {
    title: "En overskrift",
    url: "https://dr.dk/nyheder/1",
    source: "DR",
    publishedAt: "2026-09-20T08:00:00Z",
    ...overrides,
  };
}

test("indhold inden for vinduet kommer med", () => {
  const { fresh } = enforceWindow([item({ publishedAt: "2026-09-20T08:00:00Z" })], windowStart, runAt);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].publishedAt, "2026-09-20T08:00:00.000Z");
});

test("indhold ældre end vinduet kasseres", () => {
  // Ét sekund før vinduets start er stadig for gammelt.
  const { fresh, kasseret } = enforceWindow(
    [item({ publishedAt: "2026-09-19T08:59:59Z" })],
    windowStart,
    runAt
  );
  assert.equal(fresh.length, 0);
  assert.equal(kasseret.forGammelt, 1);
});

test("indhold uden dato kasseres og får ALDRIG nu som dato", () => {
  const { fresh, kasseret } = enforceWindow(
    [item({ publishedAt: null }), item({ publishedAt: "ikke en dato" })],
    windowStart,
    runAt
  );
  assert.equal(fresh.length, 0);
  assert.equal(kasseret.udenDato, 2);
});

test("indhold dateret i fremtiden kasseres", () => {
  const { fresh, kasseret } = enforceWindow(
    [item({ publishedAt: "2026-09-25T00:00:00Z" })],
    windowStart,
    runAt
  );
  assert.equal(fresh.length, 0);
  assert.equal(kasseret.iFremtiden, 1);
});

test("en blandet bunke: kun det friske slipper igennem", () => {
  const { fresh } = enforceWindow(
    [
      item({ url: "https://dr.dk/a", publishedAt: "2026-09-20T08:00:00Z" }), // frisk
      item({ url: "https://dr.dk/b", publishedAt: "2026-09-10T08:00:00Z" }), // 10 dage gammel
      item({ url: "https://dr.dk/c", publishedAt: "" }), // ingen dato
      item({ url: "https://dr.dk/d", publishedAt: "2026-09-19T20:00:00Z" }), // frisk
    ],
    windowStart,
    runAt
  );

  assert.deepEqual(
    fresh.map((f) => f.url).sort(),
    ["https://dr.dk/a", "https://dr.dk/d"]
  );

  // Og intet af det, der kom med, er ældre end vinduet.
  for (const f of fresh) {
    assert.ok(new Date(f.publishedAt) >= windowStart, `${f.url} er ældre end vinduet`);
  }
});

test("datoer uden tidszone tolkes som dansk tid, ikke serverens", () => {
  // Folketinget skriver "2026-09-20T00:00:00" uden tidszone. Dansk sommertid
  // er UTC+2, så midnat dansk tid er kl. 22 dagen før i UTC.
  const parsed = parsePublishedAt("2026-09-20T00:00:00");
  assert.ok(parsed);
  assert.equal(parsed.date.toISOString(), "2026-09-19T22:00:00.000Z");
  assert.equal(parsed.precision, "day");
});

test("datoer med tidszone tolkes som angivet", () => {
  const medZ = parsePublishedAt("2026-09-20T08:00:00Z");
  assert.equal(medZ?.date.toISOString(), "2026-09-20T08:00:00.000Z");

  const rfc822 = parsePublishedAt("Sun, 20 Sep 2026 10:00:00 +0200");
  assert.equal(rfc822?.date.toISOString(), "2026-09-20T08:00:00.000Z");
  assert.equal(rfc822?.precision, "exact");
});

// --- vinduets længde -------------------------------------------------------

test("uden kendt sidste kørsel bruges 24 timer", () => {
  const v = decideWindow(runAt, null);
  assert.equal(v.windowStart.toISOString(), "2026-09-19T09:00:00.000Z");
});

test("hullet mellem to cron-kørsler lukkes", () => {
  // Cron kørte 25 timer og 50 minutter siden, fordi Vercel ikke rammer
  // samme minuttal hver dag. Vinduet strækkes tilbage til dét tidspunkt,
  // så de ekstra knap to timer ikke tabes.
  const sidst = new Date("2026-09-19T07:10:00Z");
  const v = decideWindow(runAt, sidst);
  assert.equal(v.windowStart.toISOString(), sidst.toISOString());
});

test("efter et længere nedbrud skæres der ved 48 timer", () => {
  const sidst = new Date("2026-09-10T09:00:00Z"); // 10 dage siden
  const v = decideWindow(runAt, sidst);
  assert.equal(v.windowStart.toISOString(), "2026-09-18T09:00:00.000Z");
});

test("kørte scannet for nylig, bruges det normale vindue", () => {
  const sidst = new Date("2026-09-20T07:00:00Z"); // 2 timer siden
  const v = decideWindow(runAt, sidst);
  assert.equal(v.windowStart.toISOString(), "2026-09-19T09:00:00.000Z");
});

test("et ur der er løbet forkert kan ikke åbne vinduet", () => {
  const iFremtiden = new Date("2026-10-01T00:00:00Z");
  const v = decideWindow(runAt, iFremtiden);
  assert.equal(v.windowStart.toISOString(), "2026-09-19T09:00:00.000Z");
});
