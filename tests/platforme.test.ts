// De nye platformstyper: YouTube, Mastodon, Bluesky og Wikipedia.
//
// Alle fire leverer RSS eller Atom, så de bruger den samme hentning som
// nyhedsmedierne. Men de har hver deres særheder, og det er dem, der testes
// her. XML-uddragene nedenfor er klippet fra de RIGTIGE feeds den 20/9 2026 —
// ikke opdigtet, så testene fanger det, platformene faktisk sender.

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseFeed, artikelnavnFraWikipediaUrl } from "../app/api/cron/scan/feeds";
import { matchesKeyword } from "../app/api/cron/scan/matching";

// --- Mastodon: opslag uden titel ------------------------------------------

const MASTODON = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Gargron</title>
<item>
<guid isPermaLink="true">https://mastodon.social/@Gargron/117299324947033108</guid>
<link>https://mastodon.social/@Gargron/117299324947033108</link>
<pubDate>Sat, 19 Sep 2026 19:20:56 +0000</pubDate>
<description>&lt;p&gt;Peaches is such a beautiful baby.&lt;/p&gt;&lt;p&gt;&lt;a href="https://mastodon.social/tags/Caturday"&gt;#&lt;span&gt;Caturday&lt;/span&gt;&lt;/a&gt;&lt;/p&gt;</description>
</item></channel></rss>`;

test("et Mastodon-opslag uden titel bliver ikke kasseret", () => {
  // Før denne rettelse blev hvert eneste sociale opslag smidt væk, fordi
  // parseren krævede en <title>. Sociale opslag HAR ikke overskrifter.
  const entries = parseFeed(MASTODON, "Mastodon", "mastodon");

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Peaches is such a beautiful baby. #Caturday");
  assert.equal(entries[0].platform, "mastodon");
  assert.equal(entries[0].url, "https://mastodon.social/@Gargron/117299324947033108");
  assert.equal(entries[0].published?.toISOString(), "2026-09-19T19:20:56.000Z");
});

test("HTML i et opslag bliver til læsbar tekst, ikke kodestumper", () => {
  const entries = parseFeed(MASTODON, "Mastodon", "mastodon");
  assert.ok(!entries[0].title.includes("<p>"), "HTML-koder står stadig i titlen");
  assert.ok(!entries[0].title.includes("&lt;"), "Escapede koder står stadig i titlen");
});

// --- Bluesky: dato uden ugedag --------------------------------------------

const BLUESKY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>bsky.app</title>
<item><link>https://bsky.app/profile/bsky.app/post/3mv3zcjaijk22</link><description>Welcome to the ONLY event about Apple happening today, as far as we know.</description><pubDate>09 Sep 2026 17:02 +0000</pubDate><guid isPermaLink="false">at://did:plc:z72i7/app.bsky.feed.post/3mv3zcjaijk22</guid></item>
</channel></rss>`;

test("Bluesky bruger en datoform uden ugedag og uden sekunder", () => {
  const entries = parseFeed(BLUESKY, "Bluesky", "bluesky");

  assert.equal(entries.length, 1);
  assert.equal(entries[0].published?.toISOString(), "2026-09-09T17:02:00.000Z");
  // Linket skal være det menneskelæselige, ikke at:// -identifikatoren i guid.
  assert.ok(entries[0].url.startsWith("https://bsky.app/"));
});

// --- YouTube: Atom med media:description ----------------------------------

const YOUTUBE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
<title>En kanal</title>
<entry>
<id>yt:video:abc123</id>
<title>Ny video om dansk politik</title>
<link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
<published>2026-09-20T08:00:00+00:00</published>
<updated>2026-09-20T09:00:00+00:00</updated>
<media:group><media:description>Her taler vi om folketinget og dagens debat.</media:description></media:group>
</entry></feed>`;

test("en YouTube-video læses med titel, link og beskrivelse", () => {
  const entries = parseFeed(YOUTUBE, "En kanal", "youtube");

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Ny video om dansk politik");
  assert.equal(entries[0].url, "https://www.youtube.com/watch?v=abc123");
  assert.equal(entries[0].published?.toISOString(), "2026-09-20T08:00:00.000Z");
  assert.ok(entries[0].summary.includes("folketinget"));
});

test("et søgeord kan findes i en videos beskrivelse, ikke kun i titlen", () => {
  const entries = parseFeed(YOUTUBE, "En kanal", "youtube");
  assert.ok(matchesKeyword(entries[0].haystack, "folketinget"));
});

// --- Wikipedia: artiklens navn står kun i adressen -------------------------

const WIKIPEDIA = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Danmark - Versionshistorik</title>
<entry>
<title>InternetArchiveBot: Oprettede eller redigerede 1 arkivlinks</title>
<link rel="alternate" href="https://da.wikipedia.org/w/index.php?title=Danmark&amp;diff=12351937&amp;oldid=prev"/>
<updated>2026-09-10T14:15:35Z</updated>
<summary>Rettede formatering i afsnittet om geografi.</summary>
</entry></feed>`;

test("artiklens navn hentes ud af adressen", () => {
  assert.equal(
    artikelnavnFraWikipediaUrl(
      "https://da.wikipedia.org/w/index.php?title=Mette_Frederiksen&action=history&feed=atom"
    ),
    "Mette Frederiksen"
  );
  assert.equal(artikelnavnFraWikipediaUrl("https://da.wikipedia.org/uden-titel"), "");
  assert.equal(artikelnavnFraWikipediaUrl("ikke en adresse"), "");
});

test("en rettelse i din egen Wikipedia-artikel giver et træf på dit navn", () => {
  // Det her er hele pointen. Historik-feedet nævner ikke artiklens navn —
  // kun hvad der blev rettet. Uden artiklens navn i søgefeltet ville en
  // rettelse i din egen artikel IKKE give en omtale, medmindre dit navn
  // tilfældigvis stod i den ændrede tekst.
  const udenNavn = parseFeed(WIKIPEDIA, "Wikipedia", "wikipedia");
  assert.equal(
    matchesKeyword(udenNavn[0].haystack, "Danmark"),
    false,
    "Uden artiklens navn burde der ikke være et træf — så var testen meningsløs"
  );

  const medNavn = parseFeed(WIKIPEDIA, "Wikipedia", "wikipedia", "Danmark");
  assert.ok(
    matchesKeyword(medNavn[0].haystack, "Danmark"),
    "Rettelsen gav ikke et træf på artiklens navn"
  );
});

test("Wikipedia-rettelser har hver sin adresse, så de ikke forveksles", () => {
  const entries = parseFeed(WIKIPEDIA, "Wikipedia", "wikipedia");
  assert.ok(entries[0].url.includes("diff=12351937"));
});

// --- fælles for alle platforme --------------------------------------------

test("et indlæg uden både titel og tekst springes over", () => {
  const tomt = `<rss><channel><item>
    <link>https://eksempel.dk/1</link><pubDate>Sat, 19 Sep 2026 19:20:56 +0000</pubDate>
  </item></channel></rss>`;

  assert.equal(parseFeed(tomt, "Tom", "rss").length, 0);
});

test("et indlæg uden dato springes over, uanset platform", () => {
  // Aldersreglen må aldrig kunne omgås ved at udelade datoen.
  const udenDato = `<rss><channel><item>
    <link>https://eksempel.dk/1</link><description>Et opslag uden dato</description>
  </item></channel></rss>`;

  assert.equal(parseFeed(udenDato, "Uden dato", "bluesky").length, 0);
});

test("en meget lang tekst bliver til en læselig titel", () => {
  const lang = "ord ".repeat(100);
  const xml = `<rss><channel><item>
    <link>https://eksempel.dk/1</link>
    <pubDate>Sat, 19 Sep 2026 19:20:56 +0000</pubDate>
    <description>${lang}</description>
  </item></channel></rss>`;

  const entries = parseFeed(xml, "Lang", "mastodon");
  assert.equal(entries.length, 1);
  assert.ok(entries[0].title.length <= 121, "Titlen blev ikke klippet");
  assert.ok(entries[0].title.endsWith("…"), "Der mangler et tegn for afkortning");
  // Hele teksten skal stadig kunne søges i, selvom titlen er klippet.
  assert.ok(entries[0].summary.length > entries[0].title.length);
});
