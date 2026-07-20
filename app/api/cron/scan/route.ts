import { NextRequest, NextResponse } from "next/server";
import { getActiveCustomers, getKnownUrls, saveMention } from "./airtable";
import { fetchNews, fetchReddit, FoundItem } from "./sources";
import { sendAlertEmail } from "./email";

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

  const results: Record<string, number> = {};

  try {
    const customers = await getActiveCustomers();

    for (const customer of customers) {
      const [news, reddit] = await Promise.all([
        fetchNews(customer.keyword),
        fetchReddit(customer.keyword),
      ]);
      const allItems: FoundItem[] = [...news, ...reddit];

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
      }

      results[customer.email] = newItems.length;
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("Scan-fejl:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
