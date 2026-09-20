// De kilder, Gossip Alert foreslår at overvåge.
//
// Listen bruges til ÉT formål: at fylde Airtable-tabellen "Sources" op
// første gang, via /api/debug/sources?tilfoej=1. Derefter styrer du selv
// kilderne i Airtable — listen her overskriver aldrig noget, og den fjerner
// aldrig en kilde, du har tilføjet eller slået fra.
//
// REGLEN FOR DENNE FIL: en adresse må kun stå her, hvis den er afprøvet med
// et rigtigt kald og har svaret med læsbare indlæg. Kør
//
//     npx tsx scripts/tjek-kilder.ts
//
// for at efterprøve hele listen. Gæt aldrig en adresse ind.

export type AnbefaletKilde = {
  name: string;
  platform: string;
  type: "feed" | "search";
  url: string;
  /** Dato for seneste bekræftede kald, i formatet ÅÅÅÅ-MM-DD. */
  bekræftet: string;
};

const B = "2026-09-20";

export const ANBEFALEDE_KILDER: AnbefaletKilde[] = [
  // --- Landsdækkende nyhedsmedier ---
  { name: "DR", platform: "rss", type: "feed", url: "https://www.dr.dk/nyheder/service/feeds/senestenyt", bekræftet: B },
  { name: "DR Indland", platform: "rss", type: "feed", url: "https://www.dr.dk/nyheder/service/feeds/indland", bekræftet: B },
  { name: "DR Politik", platform: "rss", type: "feed", url: "https://www.dr.dk/nyheder/service/feeds/politik", bekræftet: B },
  { name: "DR Penge", platform: "rss", type: "feed", url: "https://www.dr.dk/nyheder/service/feeds/penge", bekræftet: B },
  { name: "DR Udland", platform: "rss", type: "feed", url: "https://www.dr.dk/nyheder/service/feeds/udland", bekræftet: B },
  { name: "DR Kultur", platform: "rss", type: "feed", url: "https://www.dr.dk/nyheder/service/feeds/kultur", bekræftet: B },
  { name: "DR Viden", platform: "rss", type: "feed", url: "https://www.dr.dk/nyheder/service/feeds/viden", bekræftet: B },
  { name: "Politiken", platform: "rss", type: "feed", url: "https://politiken.dk/rss/senestenyt.rss", bekræftet: B },
  { name: "Information", platform: "rss", type: "feed", url: "https://www.information.dk/feed", bekræftet: B },
  { name: "Ekstra Bladet", platform: "rss", type: "feed", url: "https://ekstrabladet.dk/rssfeed/all/", bekræftet: B },
  { name: "Berlingske", platform: "rss", type: "feed", url: "https://www.berlingske.dk/content/rss", bekræftet: B },
  { name: "B.T.", platform: "rss", type: "feed", url: "https://www.bt.dk/bt/seneste/rss", bekræftet: B },

  // --- Fag- og erhvervsmedier ---
  { name: "Altinget", platform: "rss", type: "feed", url: "https://www.altinget.dk/rss", bekræftet: B },
  { name: "Børsen", platform: "rss", type: "feed", url: "https://borsen.dk/rss", bekræftet: B },
  { name: "Ingeniøren", platform: "rss", type: "feed", url: "https://ing.dk/rss/nyheder", bekræftet: B },
  { name: "Journalisten", platform: "rss", type: "feed", url: "https://journalisten.dk/feed/", bekræftet: B },

  // --- TV 2's regionale stationer ---
  // TV 2 på landsplan har ingen fungerende feed-adresse. De regionale
  // stationer har hver sin, og tilsammen dækker de landet bedre, end det
  // landsdækkende feed nogensinde gjorde.
  { name: "TV 2 Kosmopol", platform: "rss", type: "feed", url: "https://www.tv2kosmopol.dk/rss", bekræftet: B },
  { name: "TV 2 Østjylland", platform: "rss", type: "feed", url: "https://www.tv2ostjylland.dk/rss", bekræftet: B },
  { name: "TV 2 ØST", platform: "rss", type: "feed", url: "https://www.tv2east.dk/rss", bekræftet: B },
  { name: "TV SYD", platform: "rss", type: "feed", url: "https://www.tvsyd.dk/rss", bekræftet: B },
  { name: "TV 2 Fyn", platform: "rss", type: "feed", url: "https://www.tv2fyn.dk/rss", bekræftet: B },
  { name: "TV MIDTVEST", platform: "rss", type: "feed", url: "https://www.tvmidtvest.dk/rss", bekræftet: B },
  { name: "TV 2 Nord", platform: "rss", type: "feed", url: "https://www.tv2nord.dk/rss", bekræftet: B },
  { name: "TV 2 Bornholm", platform: "rss", type: "feed", url: "https://www.tv2bornholm.dk/rss", bekræftet: B },

  // --- EU ---
  {
    name: "EU-Kommissionen (dansk)",
    platform: "rss",
    type: "feed",
    url: "https://ec.europa.eu/commission/presscorner/api/rss?language=da&pagesize=20",
    bekræftet: B,
  },
];

// Kilder der ER afprøvet og IKKE virker. De står her, så ingen — heller ikke
// jeg selv en anden dag — prøver den samme døde adresse igen i god tro.
export const AFPRØVET_UDEN_HELD: { navn: string; url: string; hvad: string }[] = [
  { navn: "TV 2 (landsdækkende)", url: "https://services.tv2.dk/api/feeds/nyheder/rss", hvad: "værtsnavnet findes ikke i DNS" },
  { navn: "Folketinget", url: "https://www.ft.dk/rss/nyheder", hvad: "afviser med 401" },
  { navn: "Regeringen.dk", url: "https://www.regeringen.dk/rss/", hvad: "findes ikke (404)" },
  { navn: "Statsministeriet", url: "https://www.stm.dk/rss/", hvad: "findes ikke (404)" },
  { navn: "Version2", url: "https://www.version2.dk/rss/nyheder", hvad: "findes ikke (404)" },
  { navn: "Finans", url: "https://finans.dk/rss", hvad: "svarer med en HTML-side, ikke et feed" },
  { navn: "Nordjyske", url: "https://nordjyske.dk/rss", hvad: "svarer med en HTML-side, ikke et feed" },
  { navn: "Kforum", url: "https://www.kommunikationsforum.dk/rss", hvad: "svarer med en HTML-side, ikke et feed" },
  { navn: "Europa-Parlamentet", url: "https://www.europarl.europa.eu/rss/doc/top-stories/da.xml", hvad: "svarer med HTML, intet feed" },
  {
    navn: "GDELT DOC API",
    url: "https://api.gdeltproject.org/api/v2/doc/doc",
    hvad:
      "svarer, men finder ikke dansksproget indhold. En søgning på dr.dk's " +
      "domæne gav 17 artikler, men samme domæne kombineret med et dansk ord " +
      "gav 0 over syv dage. Se docs/gdelt-fravalg.md",
  },
];
