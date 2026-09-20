import { NextRequest, NextResponse } from "next/server";

/**
 * Adgangskontrol for de ruter, der ikke er beregnet på offentligheden:
 * selve scannet og alle debug-ruter.
 *
 * Tidligere var beskyttelsen frivillig: var CRON_SECRET ikke sat, kørte
 * scannet for hvem som helst, der kendte adressen. Det betød, at en
 * tilfældig person kunne udløse scanninger og dermed udsende mails.
 * Debug-ruterne var helt uden lås.
 *
 * Nu gælder: er hemmeligheden ikke sat, svarer ruten 503 og laver ingenting.
 * Det er med vilje det mest støjende valg — en lukket rute opdages med det
 * samme, mens en åben rute kan stå åben i månedsvis uden at nogen ser det.
 */
export function kræverHemmelighed(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error(
      "CRON_SECRET er ikke sat. Ruten er låst, indtil den er oprettet som " +
        "miljøvariabel i Vercel (Settings → Environment Variables)."
    );
    return NextResponse.json(
      {
        error: "Ikke konfigureret",
        besked:
          "CRON_SECRET mangler. Opret den i Vercel under Settings → Environment Variables, " +
          "og udløs derefter en ny deployment.",
      },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Ingen adgang" }, { status: 401 });
  }

  return null;
}
