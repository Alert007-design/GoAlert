// Hvor langt tilbage rækker et feed?
//
// Et mediefeed indeholder typisk kun de seneste 10-50 artikler. Rækker et
// travlt feed kortere tilbage end vinduet, har scannet ikke set alt, hvad
// kilden har udgivet siden sidste kørsel — resten er rullet forbi. Det er
// forskellen på en tavs dag og en rolig dag, og derfor måles det.

import { test } from "node:test";
import assert from "node:assert/strict";

import { feedRækkevidde, type FeedStatus } from "../app/api/cron/scan/feeds";

const NU = new Date("2026-09-23T06:00:00Z");

function kilde(navn: string, ældste: string | null, antal = 30): FeedStatus {
  return {
    id: null,
    name: navn,
    platform: "rss",
    url: `https://eksempel.dk/${navn}`,
    ok: true,
    status: 200,
    antal,
    nyeste: "2026-09-23T05:50:00Z",
    ældste,
    fejl: null,
  };
}

test("et feed der rækker kortere tilbage end vinduet kommer med", () => {
  const udsatte = feedRækkevidde([kilde("Travlt Medie", "2026-09-23T00:00:00Z")], NU, 24);

  assert.equal(udsatte.length, 1);
  assert.equal(udsatte[0].navn, "Travlt Medie");
  assert.equal(udsatte[0].timer, 6);
});

test("et feed der rækker længere tilbage end vinduet kommer ikke med", () => {
  const udsatte = feedRækkevidde([kilde("Roligt Medie", "2026-09-20T06:00:00Z")], NU, 24);

  assert.equal(udsatte.length, 0);
});

test("en kilde uden læsbare datoer springes over", () => {
  // Ingen datoer er ikke det samme som kort rækkevidde — der er bare intet
  // at måle på. Den må hverken tælle med eller vælte målingen.
  const udsatte = feedRækkevidde(
    [kilde("Uden Datoer", null), kilde("Ugyldig Dato", "ikke en dato")],
    NU,
    24
  );

  assert.equal(udsatte.length, 0);
});

test("et roligt feed med få indlæg er ikke rulning", () => {
  // Tre indlæg fra i dag rækker kun få timer tilbage, men kilden har ikke
  // tabt noget — den har bare ikke udgivet mere. Uden den skelnen ville
  // hvert eneste stille feed blive udråbt til at rulle forbi.
  const udsatte = feedRækkevidde(
    [kilde("Stille Kilde", "2026-09-23T03:00:00Z", 3)],
    NU,
    24
  );

  assert.equal(udsatte.length, 0);
});

test("den mest udsatte kilde står forrest", () => {
  const udsatte = feedRækkevidde(
    [
      kilde("Otte Timer", "2026-09-22T22:00:00Z"),
      kilde("To Timer", "2026-09-23T04:00:00Z"),
      kilde("Uden for vinduet", "2026-09-01T06:00:00Z"),
      kilde("Fem Timer", "2026-09-23T01:00:00Z"),
    ],
    NU,
    24
  );

  assert.deepEqual(
    udsatte.map((u) => u.navn),
    ["To Timer", "Fem Timer", "Otte Timer"]
  );
});
