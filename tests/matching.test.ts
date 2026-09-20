// Søgeord skal ramme hele ord — også når de indeholder æ, ø eller å.

import { test } from "node:test";
import assert from "node:assert/strict";

import { matchesKeyword } from "../app/api/cron/scan/matching";

test("hele ord rammes", () => {
  assert.ok(matchesKeyword("regeringen vil hæve skat på biler", "skat"));
  assert.ok(matchesKeyword("Skat er et tema i valgkampen", "skat"));
});

test("delstrenge rammes IKKE", () => {
  // Den gamle fejl: "sos" ramte "Kosovo".
  assert.equal(matchesKeyword("uro i kosovo i dag", "sos"), false);
  assert.equal(matchesKeyword("nye regler for skattefri kørsel", "skat"), false);
  assert.equal(matchesKeyword("skatteudvalget mødes i dag", "skat"), false);
});

test("æ, ø og å virker", () => {
  assert.ok(matchesKeyword("nyt om søren fra fyn", "søren"));
  assert.ok(matchesKeyword("mål i overtiden", "mål"));
  assert.ok(matchesKeyword("ærø får ny færge", "ærø"));

  // Og de må heller ikke ramme som delstreng.
  assert.equal(matchesKeyword("målmanden stod godt", "mål"), false);
});

test("søgeord med flere ord matches som sammenhængende udtryk", () => {
  assert.ok(matchesKeyword("her taler statsminister frederiksen om sagen", "statsminister frederiksen"));
  assert.equal(
    matchesKeyword("statsministeren og frederiksen var uenige", "statsminister frederiksen"),
    false
  );
});

test("et søgeord kan ikke matche hen over overgangen fra titel til resumé", () => {
  // Scannet sætter titel og resumé sammen med et linjeskift netop for at
  // undgå falske træf på tværs af de to felter.
  const haystack = "nyt om klima\nminister udtaler sig i dag";
  assert.equal(matchesKeyword(haystack, "klima minister"), false);
  assert.ok(matchesKeyword(haystack, "klima"));
});

test("bindestreger og tegnsætning tæller som ordgrænse", () => {
  assert.ok(matchesKeyword("mette-marit besøger danmark", "mette"));
  assert.ok(matchesKeyword('han sagde: "skat er dyrt"', "skat"));
});

test("tomt søgeord rammer ingenting", () => {
  assert.equal(matchesKeyword("en hvilken som helst tekst", "   "), false);
});
