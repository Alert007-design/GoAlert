import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { email?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }

  const email = (body.email || "").trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Indtast en gyldig e-mailadresse." },
      { status: 400 }
    );
  }

  // TODO: Gem e-mailen et rigtigt sted, f.eks. Resend, Airtable eller en
  // database, i stedet for kun at logge den. Se README for forslag.
  console.log("Ny tilmelding til Gossip Alert:", email);

  return NextResponse.json({ ok: true });
}
