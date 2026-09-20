// Beviser krav 2: en omtale må aldrig sendes to gange.
//
// Fire veje til en dublet dækkes:
//   - samme artikel med forskellige sporingsparametre eller www/http
//   - samme artikel fundet af to forskellige søgeord i samme kørsel
//   - samme artikel liggende i to feeds
//   - samme historie bragt af flere medier
//
// Og til sidst det vigtigste: to kørsler i træk, hvor anden kørsel skal give
// nul nye omtaler.

import { test } from "node:test";
import assert from "node:assert/strict";

import { dedupeAndGroup } from "../app/api/cron/scan/grouping";
import { normalizeUrl } from "../app/api/cron/scan/urls";
import type { FreshItem } from "../app/api/cron/scan/freshness";

function f(url: string, title = "Minister går af efter kritik", source = "DR"): FreshItem {
  return { title, url, source, publishedAt: "2026-09-20T08:00:00Z" };
}

// --- URL-normalisering -----------------------------------------------------

test("sporingsparametre gør ikke en artikel til en ny artikel", () => {
  const varianter = [
    "https://www.dr.dk/nyheder/123",
    "http://dr.dk/nyheder/123",
    "https://dr.dk/nyheder/123/",
    "https://dr.dk/nyheder/123?utm_source=rss&utm_medium=feed",
    "https://m.dr.dk/nyheder/123#kommentarer",
    "https://dr.dk/nyheder/123?fbclid=abc123",
  ];

  const normaliserede = new Set(varianter.map(normalizeUrl));
  assert.equal(normaliserede.size, 1, `Forventede én adresse, fik: ${[...normaliserede].join(", ")}`);
});

test("rigtige parametre bevares — to forskellige sider forbliver forskellige", () => {
  assert.notEqual(
    normalizeUrl("https://ft.dk/search?q=klima&dokid=1"),
    normalizeUrl("https://ft.dk/search?q=klima&dokid=2")
  );
  // Rækkefølgen på parametrene må ikke gøre en forskel.
  assert.equal(
    normalizeUrl("https://ft.dk/search?q=klima&dokid=1"),
    normalizeUrl("https://ft.dk/search?dokid=1&q=klima")
  );
});

// --- dedup inden for samme kørsel -----------------------------------------

test("samme artikel i flere varianter bliver til én omtale", () => {
  const seen = new Set<string>();
  const { grouped } = dedupeAndGroup(
    [
      f("https://www.dr.dk/nyheder/123?utm_source=rss"),
      f("https://dr.dk/nyheder/123/"),
      f("http://m.dr.dk/nyheder/123#top"),
    ],
    seen
  );

  assert.equal(grouped.length, 1);
});

test("samme artikel fundet af to søgeord tælles kun én gang", () => {
  // I scannet deles sættet mellem søgeordene. Her efterlignes to kald.
  const seen = new Set<string>();

  const første = dedupeAndGroup([f("https://dr.dk/nyheder/500")], seen);
  const andet = dedupeAndGroup([f("https://dr.dk/nyheder/500")], seen);

  assert.equal(første.grouped.length, 1);
  assert.equal(andet.grouped.length, 0, "Andet søgeord må ikke give omtalen igen");
});

test("samme artikel i to feeds fra samme medie giver én omtale", () => {
  const seen = new Set<string>();
  const { grouped } = dedupeAndGroup(
    [
      { ...f("https://dr.dk/nyheder/77"), source: "DR" },
      { ...f("https://dr.dk/nyheder/77"), source: "DR Politik" },
    ],
    seen
  );

  assert.equal(grouped.length, 1);
});

// --- samme historie i flere medier ----------------------------------------

test("et Ritzau-telegram i flere medier vises som én omtale med 'også bragt i'", () => {
  const seen = new Set<string>();
  const { grouped } = dedupeAndGroup(
    [
      {
        title: "Minister går af efter massiv kritik af håndteringen",
        url: "https://dr.dk/nyheder/1",
        source: "DR",
        publishedAt: "2026-09-20T07:00:00Z",
      },
      {
        title: "Minister går af efter massiv kritik af håndteringen",
        url: "https://politiken.dk/art1",
        source: "Politiken",
        publishedAt: "2026-09-20T07:30:00Z",
      },
      {
        title: "Minister går af efter massiv kritik af håndteringen - B.T.",
        url: "https://bt.dk/art2",
        source: "B.T.",
        publishedAt: "2026-09-20T08:00:00Z",
      },
    ],
    seen
  );

  assert.equal(grouped.length, 1, "De tre versioner skal samles til én");
  // Den først udgivne vises.
  assert.equal(grouped[0].primary.source, "DR");
  assert.deepEqual(grouped[0].alsoIn.sort(), ["B.T.", "Politiken"]);

  // Alle tre adresser skal gemmes, ellers dukker de skjulte op som nye i morgen.
  assert.equal(grouped[0].members.length, 3);
});

test("to forskellige historier samme dag bliver ikke slået sammen", () => {
  const seen = new Set<string>();
  const { grouped } = dedupeAndGroup(
    [
      {
        title: "Minister går af efter massiv kritik",
        url: "https://dr.dk/a",
        source: "DR",
        publishedAt: "2026-09-20T07:00:00Z",
      },
      {
        title: "Ny rapport viser rekordstort overskud i landbruget",
        url: "https://dr.dk/b",
        source: "DR",
        publishedAt: "2026-09-20T08:00:00Z",
      },
    ],
    seen
  );

  assert.equal(grouped.length, 2);
});

// --- det afgørende: to kørsler i træk --------------------------------------

test("anden kørsel samme dag giver NUL nye omtaler", () => {
  const dagensFund = [
    f("https://dr.dk/nyheder/1", "Minister går af efter kritik", "DR"),
    f("https://politiken.dk/art9", "Helt anden historie om boligmarkedet", "Politiken"),
    f("https://bt.dk/art4?utm_source=rss", "Tredje historie om vejret", "B.T."),
  ];

  // Første kørsel: tomt arkiv.
  const arkiv = new Set<string>();
  const kørsel1 = dedupeAndGroup(dagensFund, arkiv);
  assert.equal(kørsel1.grouped.length, 3);

  // Sådan gemmer scannet: ALLE medlemmer af hver gruppe.
  const gemteUrls = new Set<string>();
  for (const gruppe of kørsel1.grouped) {
    for (const medlem of gruppe.members) gemteUrls.add(medlem.url);
  }

  // Anden kørsel: arkivet er nu det, der blev gemt. Kilderne leverer det
  // samme igen — og denne gang endda med andre sporingsparametre.
  const arkiv2 = new Set(gemteUrls);
  const kørsel2 = dedupeAndGroup(
    [
      f("https://www.dr.dk/nyheder/1?utm_campaign=x", "Minister går af efter kritik", "DR"),
      f("https://politiken.dk/art9/", "Helt anden historie om boligmarkedet", "Politiken"),
      f("http://bt.dk/art4", "Tredje historie om vejret", "B.T."),
    ],
    arkiv2
  );

  assert.equal(kørsel2.grouped.length, 0, "Anden kørsel må ikke give nye omtaler");
  assert.equal(kørsel2.sprungetOverKendt, 3);
});

test("en omtale gemt i går kommer ikke igen i dag", () => {
  const arkiv = new Set([normalizeUrl("https://dr.dk/nyheder/igaar")]);
  const { grouped } = dedupeAndGroup([f("https://www.dr.dk/nyheder/igaar?utm_source=nyhedsbrev")], arkiv);
  assert.equal(grouped.length, 0);
});
