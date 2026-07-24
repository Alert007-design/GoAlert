import { NextRequest, NextResponse } from "next/server";
import { getActiveCustomers, getKnownUrls, saveMention } from "./airtable";
import { fetchNews, fetchReddit, FoundItem } from "./sources";
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

  // Hver kunde behandles isoleret: én kundes fejl stopper ikke resten af kørslen
  // (tidligere ville en enkelt fejl afbryde scanningen for alle øvrige kunder).
  for (const customer of customers) {
    const sourceIssues: string[] = [];
    try {
      const [newsResult, redditResult] = await Promise.allSettled([
        fetchNews(customer.keyword),
        fetchReddit(customer.keyword),
      ]);

      const allItems: FoundItem[] = [];

      if (newsResult.status === "fulfilled") {
        allItems.push(...newsResult.value);
      } else {
        console.error(`Nyheds-scan fejlede for ${customer.email}:`, newsResult.reason);
        sourceIssues.push("Nyhedskilder");
      }

      if (redditResult.status === "fulfilled") {
        allItems.push(...redditResult.value);
      } else {
        console.error(`Reddit-scan fejlede for ${customer.email}:`, redditResult.reason);
        sourceIssues.push("Reddit");
      }

      const knownUrls = await getKnownUrls(customer.email);
      const newItems = allItems.filter((item) => !knownUrls.has(item.url));

      for (const item of newItems) {
        await saveMention({
          customerEmail: customer.email,
          title: item.title,
          url: item.url,
          source: item.source,
        });
      }

      if (newItems.length > 0) {
        await sendAlertEmail(customer.email, customer.name, customer.keyword, newItems);
      } else {
        // Tidligere blev der slet ikke sendt en mail her — kunden hørte intet,
        // hvilket ikke kan skelnes fra at scanningen fejlede stille.
        await sendNoResultsEmail(
          customer.email,
          customer.name,
          customer.keyword,
          sourceIssues.length > 0 ? sourceIssues : undefined
        );
      }

      results[customer.email] = { newItems: newItems.length, sourceIssues };
    } catch (err) {
      console.error(`Scan-fejl for ${customer.email}:`, err);
      results[customer.email] = { newItems: 0, sourceIssues, error: String(err) };
      // Fortsæt til næste kunde i stedet for at afbryde hele kørslen.
    }
  }

  return NextResponse.json({ ok: true, results });
}
