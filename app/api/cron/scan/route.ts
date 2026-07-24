import { NextRequest, NextResponse } from "next/server";
import { getActiveCustomers, getKnownUrls, saveMention } from "./airtable";
import { fetchNews, fetchReddit, fetchFolketinget, FoundItem } from "./sources";
import { sendAlertEmail, sendNoResultsEmail } from "./email";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Beskyt routen: kun Vercel Cron (eller nogen med hemmeligheden) må trigge et scan.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let customers;
  try {
    customers = await getActiveCustomers();
  } catch (err) {
    console.error("Kunne ikke hente aktive kunder:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  const results: Record<
    string,
    { newItems: number; sourceIssues: string[]; error?: string }
  > = {};

  // Hver kunde behandles isoleret: én kundes fejl stopper ikke resten af kørslen.
  for (const customer of customers) {
    const sourceIssues = new Set<string>();
    const newItemsByKeyword: Record<string, FoundItem[]> = {};

    try {
      const knownUrls = await getKnownUrls(customer.email);

      // Hvert søgeord scannes for sig, i stedet for at slå hele det
      // kommaseparerede felt op som én samlet søgesætning.
      for (const keyword of customer.keywords) {
        const [newsResult, redditResult, folketingetResult] = await Promise.allSettled([
          fetchNews(keyword),
          fetchReddit(keyword),
          fetchFolketinget(keyword),
        ]);

        const items: FoundItem[] = [];

        if (newsResult.status === "fulfilled") {
          items.push(...newsResult.value);
        } else {
          console.error(
            `Nyheds-scan fejlede for ${customer.email} ("${keyword}"):`,
            newsResult.reason
          );
          sourceIssues.add("Nyhedskilder");
        }

        if (redditResult.status === "fulfilled") {
          items.push(...redditResult.value);
        } else {
          console.error(
            `Reddit-scan fejlede for ${customer.email} ("${keyword}"):`,
            redditResult.reason
          );
          sourceIssues.add("Reddit");
        }

        if (folketingetResult.status === "fulfilled") {
          items.push(...folketingetResult.value);
        } else {
          console.error(
            `Folketinget-scan fejlede for ${customer.email} ("${keyword}"):`,
            folketingetResult.reason
          );
          sourceIssues.add("Folketinget");
        }

        const freshItems = items.filter((item) => !knownUrls.has(item.url));

        if (freshItems.length > 0) {
          newItemsByKeyword[keyword] = freshItems;
          for (const item of freshItems) {
            // Undgå at samme URL kan blive rapporteret under flere søgeord
            // i samme kørsel, hvis den matcher mere end ét.
            knownUrls.add(item.url);
            await saveMention({
              customerEmail: customer.email,
              title: item.title,
              url: item.url,
              source: item.source,
            });
          }
        }
      }

      const totalNew = Object.values(newItemsByKeyword).reduce(
        (sum, arr) => sum + arr.length,
        0
      );

      if (totalNew > 0) {
        await sendAlertEmail(
          customer.email,
          customer.name,
          customer.keywords,
          newItemsByKeyword
        );
      } else {
        await sendNoResultsEmail(
          customer.email,
          customer.name,
          customer.keywords,
          sourceIssues.size > 0 ? Array.from(sourceIssues) : undefined
        );
      }

      results[customer.email] = {
        newItems: totalNew,
        sourceIssues: Array.from(sourceIssues),
      };
    } catch (err) {
      console.error(`Scan-fejl for ${customer.email}:`, err);
      results[customer.email] = {
        newItems: 0,
        sourceIssues: Array.from(sourceIssues),
        error: String(err),
      };
      // Fortsæt til næste kunde i stedet for at afbryde hele kørslen.
    }
  }

  return NextResponse.json({ ok: true, results });
}
