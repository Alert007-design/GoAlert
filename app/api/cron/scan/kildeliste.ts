// Reservelisten over kilder.
//
// Kilderne styres normalt fra Airtable-tabellen "Sources", så de kan
// tilføjes og fjernes uden kodeændringer. Denne liste bruges kun, hvis
// tabellen ikke kan læses — fx fordi den endnu ikke er oprettet, eller fordi
// Airtable er nede. Uden den ville en manglende tabel betyde en tavs dag
// uden overvågning, og det er værre end en lidt forældet liste.
//
// Et mediefeed indeholder typisk kun de seneste 10-50 artikler. Med én daglig
// kørsel kan travle feeds nå at rulle forbi mellem to scanninger — det er en
// kendt begrænsning, ikke en fejl.

export type Feed = {
  /** Vises som kildenavn i mails og i Airtable. */
  name: string;
  url: string;
  /**
   * false = adressen er ikke bekræftet med et rigtigt kald.
   * Alle nedenstående er bekræftet 20/9 2026.
   */
  verified: boolean;
};

export const FALLBACK_FEEDS: Feed[] = [
  { name: "DR", url: "https://www.dr.dk/nyheder/service/feeds/senestenyt", verified: true },
  { name: "DR Indland", url: "https://www.dr.dk/nyheder/service/feeds/indland", verified: true },
  { name: "DR Politik", url: "https://www.dr.dk/nyheder/service/feeds/politik", verified: true },
  { name: "DR Penge", url: "https://www.dr.dk/nyheder/service/feeds/penge", verified: true },
  { name: "DR Udland", url: "https://www.dr.dk/nyheder/service/feeds/udland", verified: true },
  { name: "DR Kultur", url: "https://www.dr.dk/nyheder/service/feeds/kultur", verified: true },
  { name: "DR Viden", url: "https://www.dr.dk/nyheder/service/feeds/viden", verified: true },
  { name: "Politiken", url: "https://politiken.dk/rss/senestenyt.rss", verified: true },
  { name: "Information", url: "https://www.information.dk/feed", verified: true },
  { name: "Ekstra Bladet", url: "https://ekstrabladet.dk/rssfeed/all/", verified: true },
  { name: "Berlingske", url: "https://www.berlingske.dk/content/rss", verified: true },
  { name: "Altinget", url: "https://www.altinget.dk/rss", verified: true },
  { name: "B.T.", url: "https://www.bt.dk/bt/seneste/rss", verified: true },
  { name: "Børsen", url: "https://borsen.dk/rss", verified: true },

  // TV 2 på landsplan er ude: services.tv2.dk findes ikke længere i DNS, og
  // seks andre oplagte adresser svarer med TV 2's fejlside. Der gættes ikke
  // en ny adresse. TV 2's regionale stationer virker derimod — de tilføjes
  // i tabellen Sources, ikke her.
];
