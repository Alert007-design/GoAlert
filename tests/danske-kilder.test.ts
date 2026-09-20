// Beviser, at ingen udenlandsk kilde slipper igennem.
//
// Google News blev droppet, fordi den leverede norske kilder, selvom vi bad
// om danske. Lektien er, at en udbyders eget landefilter ikke kan bruges som
// facit. Testene her kontrollerer VORES egen kontrol — den der får det sidste
// ord, uanset hvad GDELT eller nogen anden påstår.

import { test } from "node:test";
import assert from "node:assert/strict";

import { erDanskKilde, afvisningsgrund, kunDanske } from "../app/api/cron/scan/danske-kilder";
import {
  omsætSvar,
  byggeQuery,
  læsGdeltDato,
  isGdeltEnabled,
} from "../app/api/cron/scan/gdelt";

// --- den grundlæggende kontrol --------------------------------------------

test("danske domæner godkendes", () => {
  for (const d of [
    "https://www.dr.dk/nyheder/123",
    "https://politiken.dk/art1",
    "dr.dk",
    "www.tv2fyn.dk",
    "https://sub.domæne.dk/side",
  ]) {
    assert.ok(erDanskKilde(d), `${d} burde være godkendt som dansk`);
  }
});

test("norske og svenske domæner afvises", () => {
  // Det var netop norske kilder, der gjorde Google News ubrugelig.
  for (const d of [
    "https://www.nrk.no/nyheter",
    "https://vg.no",
    "https://www.aftonbladet.se",
    "https://svt.se/nyheter",
  ]) {
    assert.equal(erDanskKilde(d), false, `${d} slap igennem som dansk`);
  }
});

test("afvisningen forklarer hvilket land der var tale om", () => {
  assert.match(afvisningsgrund("https://nrk.no/x"), /norsk/);
  assert.match(afvisningsgrund("https://aftonbladet.se/x"), /svensk/);
  assert.match(afvisningsgrund("https://spiegel.de/x"), /tysk/);
  assert.match(afvisningsgrund("https://cnn.com/x"), /ikke et dansk domæne/);
});

test("et domæne der blot INDEHOLDER dk afvises", () => {
  // "dknyheder.com" og "nordisk.no" må ikke kunne narre kontrollen.
  assert.equal(erDanskKilde("https://dknyheder.com"), false);
  assert.equal(erDanskKilde("https://nordisk.no"), false);
  assert.equal(erDanskKilde("https://dk.example.com"), false);
  assert.equal(erDanskKilde("https://example.com/dk"), false);
});

test("tomt eller ulæseligt afvises", () => {
  assert.equal(erDanskKilde(""), false);
  assert.equal(erDanskKilde("   "), false);
  assert.equal(erDanskKilde("ikke en adresse med mellemrum"), false);
});

// --- GDELT: det egentlige bevis -------------------------------------------

/**
 * Et svar i samme form som GDELT's eget, med en blanding af danske og
 * udenlandske kilder. Formen er taget fra et rigtigt svar 20/9 2026, hvor
 * en søgning uden filter blandt andet returnerede nationalpost.com.
 */
const GDELT_BLANDET = [
  { url: "https://www.dr.dk/nyheder/politik/1", title: "Dansk artikel", domain: "dr.dk", seendate: "20260920T160000Z", language: "Danish", sourcecountry: "Denmark" },
  { url: "https://nationalpost.com/news/2", title: "Canadian article", domain: "nationalpost.com", seendate: "20260920T174500Z", language: "English", sourcecountry: "Canada" },
  { url: "https://www.nrk.no/3", title: "Norsk artikkel", domain: "nrk.no", seendate: "20260920T170000Z", language: "Norwegian", sourcecountry: "Norway" },
  { url: "https://www.aftonbladet.se/4", title: "Svensk artikel", domain: "aftonbladet.se", seendate: "20260920T170000Z", language: "Swedish", sourcecountry: "Sweden" },
  { url: "https://politiken.dk/art5", title: "Endnu en dansk", domain: "politiken.dk", seendate: "20260920T150000Z", language: "Danish", sourcecountry: "Denmark" },
  // Den lumske: GDELT PÅSTÅR at den er dansk, men domænet er norsk.
  { url: "https://www.vg.no/6", title: "Påstået dansk", domain: "vg.no", seendate: "20260920T160000Z", language: "Danish", sourcecountry: "Denmark" },
];

test("INGEN udenlandsk kilde slipper igennem", () => {
  const { items, afvist } = omsætSvar(GDELT_BLANDET);

  // Det centrale løfte: hver eneste tilbageværende artikel er dansk.
  for (const item of items) {
    assert.ok(
      erDanskKilde(item.url),
      `En ikke-dansk kilde slap igennem: ${item.url}`
    );
    assert.match(
      new URL(item.url).hostname,
      /\.dk$/,
      `${item.url} er ikke et .dk-domæne`
    );
  }

  assert.equal(items.length, 2, "Kun de to danske artikler må være tilbage");
  assert.equal(afvist.length, 4);
});

test("GDELT's eget sourcecountry bruges ikke som facit", () => {
  // vg.no er markeret som Denmark i svaret. Den skal alligevel afvises,
  // fordi domænet er norsk. Det er hele pointen med at kontrollere selv.
  const { items } = omsætSvar(GDELT_BLANDET);
  const domæner = items.map((i) => new URL(i.url).hostname);

  assert.ok(!domæner.includes("www.vg.no"), "En norsk kilde slap igennem, fordi GDELT kaldte den dansk");
});

test("de afviste er navngivet med grund, så fravalget kan efterprøves", () => {
  const { afvist } = omsætSvar(GDELT_BLANDET);
  const kilder = afvist.map((a) => a.kilde);

  assert.ok(kilder.includes("nationalpost.com"));
  assert.ok(kilder.includes("nrk.no"));
  assert.ok(kilder.includes("aftonbladet.se"));
  assert.ok(kilder.includes("vg.no"));

  for (const a of afvist) {
    assert.ok(a.grund.length > 0, `${a.kilde} blev afvist uden grund`);
  }
});

test("et tomt svar giver ingen artikler og ingen fejl", () => {
  const { items, afvist, leveret } = omsætSvar([]);
  assert.equal(items.length, 0);
  assert.equal(afvist.length, 0);
  assert.equal(leveret, 0);
});

test("artikler uden adresse eller titel springes over", () => {
  const { items } = omsætSvar([
    { url: "https://dr.dk/1", domain: "dr.dk", seendate: "20260920T160000Z" },
    { title: "Uden adresse", domain: "dr.dk", seendate: "20260920T160000Z" },
  ] as any);

  assert.equal(items.length, 0);
});

// --- forespørgsel og datoer -----------------------------------------------

test("søgeordet sættes i anførselstegn og landefilteret sendes med", () => {
  // Uden anførselstegn tolker GDELT flere ord som "et af ordene", og ved
  // afprøvning gav enkeltord uden anførselstegn slet ingen resultater.
  assert.equal(byggeQuery("mette frederiksen"), '"mette frederiksen" sourcecountry:DA');
  assert.equal(byggeQuery("  klima  "), '"klima" sourcecountry:DA');
  // Anførselstegn i selve søgeordet må ikke kunne bryde forespørgslen.
  assert.equal(byggeQuery('mit "navn"'), '"mit navn" sourcecountry:DA');
});

test("GDELT's datoform oversættes til den form resten af systemet bruger", () => {
  assert.equal(læsGdeltDato("20260920T174500Z"), "2026-09-20T17:45:00Z");
  assert.equal(læsGdeltDato("ikke en dato"), null);
  assert.equal(læsGdeltDato(""), null);
});

test("GDELT er slået fra, indtil den kan bevises", () => {
  // Afprøvet 20/9 2026: GDELT finder ikke dansksproget indhold.
  // Se docs/gdelt-fravalg.md. Skal den tændes igen, skal det være en
  // bevidst beslutning — ikke noget der sker ved et uheld.
  const gemt = process.env.GDELT_ENABLED;
  delete process.env.GDELT_ENABLED;
  assert.equal(isGdeltEnabled(), false);

  process.env.GDELT_ENABLED = "false";
  assert.equal(isGdeltEnabled(), false);

  process.env.GDELT_ENABLED = "true";
  assert.equal(isGdeltEnabled(), true);

  if (gemt === undefined) delete process.env.GDELT_ENABLED;
  else process.env.GDELT_ENABLED = gemt;
});

test("kunDanske returnerer både det godkendte og det afviste", () => {
  const { danske, afvist } = kunDanske(
    ["https://dr.dk/1", "https://nrk.no/2", "https://politiken.dk/3"],
    (u) => u
  );
  assert.equal(danske.length, 2);
  assert.equal(afvist.length, 1);
  assert.equal(afvist[0].kilde, "nrk.no");
});

test("en artikel med ulæselig dato får null — aldrig 'nu'", () => {
  const { items } = omsætSvar([
    { url: "https://dr.dk/1", title: "Uden brugbar dato", domain: "dr.dk", seendate: "noget vrøvl" },
  ]);

  assert.equal(items.length, 1);
  assert.equal(
    items[0].publishedAt,
    null,
    "En ulæselig dato må aldrig blive til et tidspunkt — så ville aldersreglen kunne omgås"
  );
});
