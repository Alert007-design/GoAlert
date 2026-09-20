// Kildelisten styres fra Airtable. Det vigtigste at sikre er, at en
// manglende eller halvfærdig tabel ALDRIG stopper overvågningen — og at den
// fælles datamodel holder, uanset hvilken platform en kilde kommer fra.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { getSources, rækkeTilKilde, læsType } from "../app/api/cron/scan/sources-table";
import { FALLBACK_FEEDS } from "../app/api/cron/scan/kildeliste";
import { enforceWindow, type RawItem } from "../app/api/cron/scan/freshness";

const gemt = {
  base: process.env.AIRTABLE_BASE_ID,
  token: process.env.AIRTABLE_TOKEN,
};

beforeEach(() => {
  delete process.env.AIRTABLE_BASE_ID;
  delete process.env.AIRTABLE_TOKEN;
});

afterEach(() => {
  if (gemt.base === undefined) delete process.env.AIRTABLE_BASE_ID;
  else process.env.AIRTABLE_BASE_ID = gemt.base;
  if (gemt.token === undefined) delete process.env.AIRTABLE_TOKEN;
  else process.env.AIRTABLE_TOKEN = gemt.token;
});

// --- reservelisten ---------------------------------------------------------

test("uden Airtable falder kildelisten tilbage til listen i koden", async () => {
  const { kilder, fraTabel, begrundelse } = await getSources(true);

  assert.equal(fraTabel, false);
  assert.equal(kilder.length, FALLBACK_FEEDS.length);
  assert.ok(kilder.length > 0, "Reservelisten må ikke være tom");
  assert.ok(begrundelse.length > 0, "Der skal være en forklaring til loggen");
});

test("reservelistens kilder har den fælles datamodel udfyldt", async () => {
  const { kilder } = await getSources(true);

  for (const k of kilder) {
    assert.equal(typeof k.name, "string");
    assert.ok(k.name.length > 0);
    assert.equal(k.platform, "rss");
    assert.equal(k.type, "feed");
    assert.ok(k.url.startsWith("https://"), `${k.name} har ikke en https-adresse`);
    assert.equal(k.id, null, "Reservelistens kilder har ingen Airtable-række");
  }
});

test("TV 2 på landsplan er ikke i reservelisten", () => {
  // Adressen findes ikke længere i DNS. Den må ikke snige sig ind igen uden
  // at nogen har bekræftet en ny adresse med et rigtigt kald.
  const tv2 = FALLBACK_FEEDS.find((f) => f.url.includes("services.tv2.dk"));
  assert.equal(tv2, undefined);
});

test("alle kilder i reservelisten er markeret som bekræftede", () => {
  for (const f of FALLBACK_FEEDS) {
    assert.equal(f.verified, true, `${f.name} er ikke bekræftet med et rigtigt kald`);
  }
});

// --- læsning af én række ---------------------------------------------------

test("en fuldt udfyldt række bliver til en kilde", () => {
  const kilde = rækkeTilKilde({
    id: "rec123",
    fields: {
      Name: "TV 2 Fyn",
      Platform: "RSS",
      Type: "feed",
      URL: "https://www.tv2fyn.dk/rss",
    },
  });

  assert.deepEqual(kilde, {
    id: "rec123",
    name: "TV 2 Fyn",
    platform: "rss", // små bogstaver, så skrivemåden i Airtable ikke betyder noget
    type: "feed",
    url: "https://www.tv2fyn.dk/rss",
  });
});

test("en række uden adresse eller navn springes over i stedet for at vælte kørslen", () => {
  assert.equal(rækkeTilKilde({ id: "r1", fields: { Name: "Uden adresse" } }), null);
  assert.equal(rækkeTilKilde({ id: "r2", fields: { URL: "https://eksempel.dk/rss" } }), null);
  assert.equal(rækkeTilKilde({ id: "r3", fields: {} }), null);
  assert.equal(rækkeTilKilde({ id: "r4" }), null);
});

test("mangler Platform, antages rss", () => {
  const kilde = rækkeTilKilde({
    id: "rec1",
    fields: { Name: "En kilde", URL: "https://eksempel.dk/feed" },
  });
  assert.equal(kilde?.platform, "rss");
});

test("kun 'search' giver typen search — alt andet er feed", () => {
  assert.equal(læsType("search"), "search");
  assert.equal(læsType("SEARCH"), "search");
  assert.equal(læsType(" Search "), "search");
  assert.equal(læsType("feed"), "feed");
  assert.equal(læsType("noget andet"), "feed");
  assert.equal(læsType(undefined), "feed");
  assert.equal(læsType(""), "feed");
});

// --- den fælles datamodel --------------------------------------------------

test("en ny platform er underlagt præcis samme aldersregel som de gamle", () => {
  // Pointen med den fælles datamodel: en kilde fra YouTube eller Mastodon
  // kan ikke slippe uden om 24-timers-reglen, fordi den går gennem det samme
  // ene sted som alt andet.
  const runAt = new Date("2026-09-20T09:00:00Z");
  const windowStart = new Date("2026-09-19T09:00:00Z");

  const nyePlatforme: RawItem[] = [
    {
      title: "Ny video",
      url: "https://youtube.com/watch?v=1",
      source: "En kanal",
      platform: "youtube",
      publishedAt: "2026-09-20T08:00:00Z", // frisk
    },
    {
      title: "Gammelt opslag",
      url: "https://mastodon.social/@nogen/1",
      source: "Mastodon",
      platform: "mastodon",
      publishedAt: "2026-09-01T08:00:00Z", // for gammelt
    },
    {
      title: "Uden dato",
      url: "https://bsky.app/profile/nogen/post/1",
      source: "Bluesky",
      platform: "bluesky",
      publishedAt: null,
    },
  ];

  const { fresh, kasseret } = enforceWindow(nyePlatforme, windowStart, runAt);

  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].platform, "youtube");
  assert.equal(kasseret.forGammelt, 1);
  assert.equal(kasseret.udenDato, 1);
});
