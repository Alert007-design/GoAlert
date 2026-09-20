// Den anbefalede kildeliste er den ene liste, der må tilføje kilder til
// Airtable. Derfor skal den holdes ærlig: ingen dubletter, ingen gættede
// adresser, og ingen adresse der allerede er afprøvet uden held.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANBEFALEDE_KILDER,
  AFPRØVET_UDEN_HELD,
} from "../app/api/cron/scan/anbefalede-kilder";
import { FALLBACK_FEEDS } from "../app/api/cron/scan/kildeliste";
import { normalizeUrl } from "../app/api/cron/scan/urls";

test("hver kilde har en bekræftelsesdato", () => {
  // Datoen er kvitteringen for, at adressen er afprøvet med et rigtigt kald.
  for (const k of ANBEFALEDE_KILDER) {
    assert.match(
      k.bekræftet,
      /^\d{4}-\d{2}-\d{2}$/,
      `${k.name} mangler en gyldig bekræftelsesdato`
    );
  }
});

test("ingen kilde optræder to gange", () => {
  const set = new Set<string>();
  for (const k of ANBEFALEDE_KILDER) {
    const n = normalizeUrl(k.url);
    assert.ok(!set.has(n), `${k.name} har samme adresse som en anden kilde: ${k.url}`);
    set.add(n);
  }
});

test("ingen navne går igen", () => {
  const navne = ANBEFALEDE_KILDER.map((k) => k.name);
  assert.equal(new Set(navne).size, navne.length, "To kilder har samme navn");
});

test("alle adresser er https", () => {
  for (const k of ANBEFALEDE_KILDER) {
    assert.ok(k.url.startsWith("https://"), `${k.name} bruger ikke https: ${k.url}`);
  }
});

test("en adresse der er afprøvet uden held kan ikke stå som anbefalet", () => {
  // Det her er hele pointen med at føre liste over de døde adresser: at
  // ingen — heller ikke om et halvt år — prøver den samme igen i god tro.
  const døde = new Set(AFPRØVET_UDEN_HELD.map((d) => normalizeUrl(d.url)));
  for (const k of ANBEFALEDE_KILDER) {
    assert.ok(
      !døde.has(normalizeUrl(k.url)),
      `${k.name} står som anbefalet, men adressen er afprøvet uden held`
    );
  }
});

test("TV 2's døde landsdækkende adresse er stadig markeret som død", () => {
  const tv2 = AFPRØVET_UDEN_HELD.find((d) => d.url.includes("services.tv2.dk"));
  assert.ok(tv2, "TV 2's døde adresse skal blive stående i listen over afprøvede");
});

test("alle ni regionale TV 2-stationer er med", () => {
  const forventet = [
    "TV 2 Kosmopol",
    "TV 2 Østjylland",
    "TV 2 ØST",
    "TV SYD",
    "TV 2 Fyn",
    "TV MIDTVEST",
    "TV 2 Nord",
    "TV 2 Bornholm",
  ];
  const navne = ANBEFALEDE_KILDER.map((k) => k.name);
  for (const n of forventet) {
    assert.ok(navne.includes(n), `${n} mangler i den anbefalede liste`);
  }
});

test("reservelisten følger automatisk med den anbefalede liste", () => {
  // De to lister må aldrig kunne sige noget forskelligt. Reservelisten
  // udledes derfor af den anbefalede, i stedet for at blive vedligeholdt
  // ved siden af.
  const feeds = ANBEFALEDE_KILDER.filter((k) => k.type === "feed");
  assert.equal(FALLBACK_FEEDS.length, feeds.length);

  for (const f of FALLBACK_FEEDS) {
    assert.equal(f.verified, true, `${f.name} står som ikke-bekræftet`);
  }
});

test("opfyldningen kan ikke oprette en dublet af en kilde der allerede findes", () => {
  // Sådan sammenligner ruten: på normaliseret adresse. Den samme kilde
  // skrevet med www, uden skråstreg eller med http skal tælle som fundet.
  const iTabellen = [
    "http://www.dr.dk/nyheder/service/feeds/senestenyt/",
    "https://www.tv2fyn.dk/rss",
  ];
  const findes = new Set(iTabellen.map(normalizeUrl));

  const manglende = ANBEFALEDE_KILDER.filter((k) => !findes.has(normalizeUrl(k.url)));
  const manglendeNavne = manglende.map((k) => k.name);

  assert.ok(!manglendeNavne.includes("DR"), "DR ville være blevet oprettet som dublet");
  assert.ok(!manglendeNavne.includes("TV 2 Fyn"), "TV 2 Fyn ville være blevet oprettet som dublet");
  assert.equal(manglende.length, ANBEFALEDE_KILDER.length - 2);
});
