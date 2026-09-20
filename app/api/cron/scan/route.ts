import { NextRequest, NextResponse } from "next/server";
import {
  getActiveCustomers,
  getKnownUrls,
  saveMentions,
  logCustomers,
  getLastSuccessfulRun,
  recordRun,
  type MentionRække,
} from "./airtable";
import {
  fetchNews,
  fetchReddit,
  fetchFolketinget,
  isRedditEnabled,
  type RawItem,
} from "./sources";
import { decideWindow, enforceWindow, type FreshItem } from "./freshness";
import { dedupeAndGroup, type GroupedItem } from "./grouping";
import { normalizeUrl } from "./urls";
import { sendAlertEmail, sendNoResultsEmail } from "./email";
import { kræverHemmelighed } from "../../_lib/auth";

export const maxDuration = 60;

/**
 * Den daglige overvågning.
 *
 * Rækkefølgen i denne fil er ikke tilfældig. To ting skal holde hver gang:
 *
 *  1. Intet må med i mailen, der er udgivet før vinduets start. Alle kilder
 *     indsamler bredt, og aldersreglen anvendes ét sted — enforceWindow().
 *  2. Ingen omtale må sendes to gange. Derfor gemmes en omtale FØRST, når
 *     mailen rent faktisk er afsendt uden fejl. Gik mailen ikke igennem,
 *     bliver omtalen stående som ikke-set og kommer med i morgen.
 */
export async function GET(req: NextRequest) {
  const afvist = kræverHemmelighed(req);
  if (afvist) return afvist;

  // Ét fælles "nu" for hele kørslen. Ville tidspunktet blive aflæst undervejs,
  // ville grænsen skride nogle sekunder for hvert søgeord.
  const runAt = new Date();

  const sidsteKørsel = await getLastSuccessfulRun();
  const vindue = decideWindow(runAt, sidsteKørsel);
  console.log(
    `[scan] Vindue: ${vindue.windowStart.toISOString()} → ${runAt.toISOString()}. ${vindue.begrundelse}`
  );

  let customers;
  try {
    customers = await getActiveCustomers();
  } catch (err) {
    console.error("Kunne ikke hente aktive kunder:", err);
    await recordRun({ runAt, status: "fejl", note: `Kunne ikke hente kunder: ${err}` });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  logCustomers(customers);

  const results: Record<
    string,
    {
      fundIAlt: number;
      nyeOmtaler: number;
      slåetSammen: number;
      kildeproblemer: string[];
      mailSendt: boolean;
      gemt: number;
      error?: string;
    }
  > = {};

  let nogenFejlede = false;

  for (const customer of customers) {
    const kildeproblemer = new Set<string>();
    let fundIAlt = 0;

    try {
      // Alt hvad kunden nogensinde har fået. Deles på tværs af søgeordene,
      // så den samme artikel ikke kan komme med under to søgeord.
      const seen = await getKnownUrls(customer.email);

      const friskeMedSøgeord: { keyword: string; item: FreshItem }[] = [];

      for (const keyword of customer.keywords) {
        const rå: RawItem[] = [];

        const opgaver: Promise<{ items: RawItem[]; døde: string[] }>[] = [
          fetchNews(keyword),
          fetchFolketinget(keyword, vindue.windowStart),
        ];
        const navne = ["Nyhedskilder", "Folketinget"];

        if (isRedditEnabled()) {
          opgaver.push(fetchReddit(keyword));
          navne.push("Reddit");
        }

        const svar = await Promise.allSettled(opgaver);

        svar.forEach((s, i) => {
          if (s.status === "fulfilled") {
            rå.push(...s.value.items);
            // En enkelt død RSS-kilde skal også kunne ses af kunden, ikke kun
            // i loggen. Ellers ligner en tavs dag en rolig dag.
            for (const dødKilde of s.value.døde) kildeproblemer.add(dødKilde);
          } else {
            console.error(`${navne[i]} fejlede for ${customer.email} ("${keyword}"):`, s.reason);
            kildeproblemer.add(navne[i]);
          }
        });

        fundIAlt += rå.length;

        // Den centrale aldersregel — ét sted, for alle kilder.
        const { fresh, kasseret } = enforceWindow(rå, vindue.windowStart, runAt);
        console.log(
          `[scan] ${customer.email} "${keyword}": ${rå.length} indsamlet → ${fresh.length} inden for vinduet ` +
            `(kasseret: ${kasseret.forGammelt} for gamle, ${kasseret.udenDato} uden dato, ${kasseret.iFremtiden} i fremtiden)`
        );

        for (const item of fresh) friskeMedSøgeord.push({ keyword, item });
      }

      // Hvilket søgeord fandt artiklen først? Bruges til at placere den i den
      // rigtige sektion i mailen, efter at dubletter er fjernet.
      const søgeordPrUrl = new Map<string, string>();
      for (const { keyword, item } of friskeMedSøgeord) {
        const url = normalizeUrl(item.url);
        if (!søgeordPrUrl.has(url)) søgeordPrUrl.set(url, keyword);
      }

      const { grouped, sprungetOverKendt, slåetSammen } = dedupeAndGroup(
        friskeMedSøgeord.map((f) => f.item),
        seen
      );

      console.log(
        `[scan] ${customer.email}: ${grouped.length} nye omtaler ` +
          `(${sprungetOverKendt} kendt i forvejen, ${slåetSammen} samme historie i flere medier)`
      );

      const efterSøgeord: Record<string, GroupedItem[]> = {};
      for (const gruppe of grouped) {
        const keyword =
          søgeordPrUrl.get(normalizeUrl(gruppe.primary.url)) || customer.keywords[0];
        (efterSøgeord[keyword] ||= []).push(gruppe);
      }

      const problemListe = kildeproblemer.size > 0 ? Array.from(kildeproblemer) : undefined;

      if (grouped.length === 0) {
        const sendt = await sendNoResultsEmail(
          customer.email,
          customer.name,
          customer.keywords,
          problemListe
        );
        if (!sendt) nogenFejlede = true;

        results[customer.email] = {
          fundIAlt,
          nyeOmtaler: 0,
          slåetSammen,
          kildeproblemer: Array.from(kildeproblemer),
          mailSendt: sendt,
          gemt: 0,
        };
        continue;
      }

      // ---- Her ligger hele pointen i kravet om ingen gentagelser ----
      //
      // Mailen sendes FØRST. Først når den er afsendt uden fejl, markeres
      // omtalerne som set. Fejler afsendelsen, gemmes intet, og omtalerne
      // kommer med i morgen i stedet for at forsvinde i stilhed.
      const mailSendt = await sendAlertEmail(
        customer.email,
        customer.name,
        customer.keywords,
        efterSøgeord,
        problemListe
      );

      if (!mailSendt) {
        nogenFejlede = true;
        console.error(
          `[scan] Mailen til ${customer.email} kunne ikke sendes. ` +
            `${grouped.length} omtale(r) gemmes IKKE, så de kommer med ved næste kørsel.`
        );
        results[customer.email] = {
          fundIAlt,
          nyeOmtaler: grouped.length,
          slåetSammen,
          kildeproblemer: Array.from(kildeproblemer),
          mailSendt: false,
          gemt: 0,
          error: "Mailen kunne ikke sendes — intet gemt",
        };
        continue;
      }

      // Alle medlemmer af en gruppe gemmes, også dem der kun blev vist som
      // "også bragt i". Ellers ville de tælle som nye i morgen.
      const rækker: MentionRække[] = [];
      for (const gruppe of grouped) {
        for (const medlem of gruppe.members) {
          rækker.push({
            customerEmail: customer.email,
            title: medlem.item.title,
            url: medlem.url,
            source: medlem.item.source,
            publishedAt: medlem.item.publishedAt,
          });
        }
      }

      const gemt = await saveMentions(rækker);
      if (gemt < rækker.length) {
        nogenFejlede = true;
        console.error(
          `[scan] Kun ${gemt} af ${rækker.length} omtaler blev gemt for ${customer.email}. ` +
            "De ikke-gemte kan blive sendt igen i morgen."
        );
      }

      results[customer.email] = {
        fundIAlt,
        nyeOmtaler: grouped.length,
        slåetSammen,
        kildeproblemer: Array.from(kildeproblemer),
        mailSendt: true,
        gemt,
      };
    } catch (err) {
      nogenFejlede = true;
      console.error(`Scan-fejl for ${customer.email}:`, err);
      results[customer.email] = {
        fundIAlt,
        nyeOmtaler: 0,
        slåetSammen: 0,
        kildeproblemer: Array.from(kildeproblemer),
        mailSendt: false,
        gemt: 0,
        error: String(err),
      };
      // Fortsæt til næste kunde i stedet for at afbryde hele kørslen.
    }
  }

  // Kørslen markeres kun som vellykket, hvis alt gik godt. En kørsel med fejl
  // må ikke rykke vinduet frem — så ville det, der fejlede, falde ud af
  // vinduet i morgen og aldrig blive sendt.
  await recordRun({
    runAt,
    status: nogenFejlede ? "fejl" : "ok",
    note: nogenFejlede
      ? `Mindst én kunde eller mail fejlede. ${vindue.begrundelse}`
      : `${customers.length} kunde(r) behandlet. ${vindue.begrundelse}`,
  });

  return NextResponse.json({
    ok: !nogenFejlede,
    vindue: {
      fra: vindue.windowStart.toISOString(),
      til: runAt.toISOString(),
      begrundelse: vindue.begrundelse,
    },
    results,
  });
}
