// Kildelisten, styret fra Airtable-tabellen "Sources".
//
// Formålet er, at kilder kan tilføjes og fjernes uden kodeændringer. Tabellen
// er FRIVILLIG: findes den ikke, bruges reservelisten i kildeliste.ts, og der
// skrives én linje i loggen. En manglende hjælpetabel må aldrig kunne stoppe
// overvågningen.
//
// Alle kilder leverer den samme datamodel videre i systemet:
//   title, url, source, platform, publishedAt, excerpt
//
// Kolonner i Airtable (se README for klikvejledning):
//   Name            enkelt linje tekst   — vises som kildenavn i mailen
//   Platform        enkelt linje tekst   — rss, youtube, mastodon, bluesky, wikipedia …
//   Type            single select        — feed eller search
//   URL             enkelt linje tekst   — adressen eller identifikatoren
//   Active          afkrydsningsfelt     — kun afkrydsede kilder hentes
//   LastStatus      enkelt linje tekst   — skrives af kildetjekket
//   LastChecked     dato med tid         — skrives af kildetjekket
//   LastItemCount   tal                  — skrives af kildetjekket

import { BASE_URL, airtableHeaders, beskrivFejl, pace } from "./airtable";
import { FALLBACK_FEEDS } from "./kildeliste";

const TABEL = "Sources";

/**
 * "feed"   = hent alt fra adressen og filtrér lokalt på søgeordet.
 * "search" = spørg kilden om ét søgeord ad gangen.
 *
 * Alle nuværende kilder er af typen feed. "search" er med i modellen nu, så
 * GDELT og lignende kan tilføjes senere uden at tabellen skal laves om.
 */
export type KildeType = "feed" | "search";

export type Kilde = {
  /** Airtable-rækkens id. null betyder, at kilden kommer fra reservelisten. */
  id: string | null;
  name: string;
  platform: string;
  type: KildeType;
  url: string;
};

export type Kildeliste = {
  kilder: Kilde[];
  /** false = tabellen kunne ikke læses, reservelisten bruges. */
  fraTabel: boolean;
  /** Forklaring til loggen og til /api/debug/feeds. */
  begrundelse: string;
};

function reserveliste(begrundelse: string): Kildeliste {
  return {
    kilder: FALLBACK_FEEDS.map((f) => ({
      id: null,
      name: f.name,
      platform: "rss",
      type: "feed" as KildeType,
      url: f.url,
    })),
    fraTabel: false,
    begrundelse,
  };
}

/** Kun de to typer findes. Alt andet behandles som "feed". */
export function læsType(rå: unknown): KildeType {
  return String(rå || "").trim().toLowerCase() === "search" ? "search" : "feed";
}

/**
 * Oversætter én Airtable-række til en kilde.
 *
 * Returnerer null, hvis rækken ikke kan bruges — så springes den over med en
 * linje i loggen i stedet for at vælte hele kørslen. En halvfærdig række i
 * Airtable er noget, der sker, og det må ikke stoppe overvågningen.
 */
export function rækkeTilKilde(record: {
  id?: string;
  fields?: Record<string, unknown>;
}): Kilde | null {
  const felter = record.fields || {};
  const url = String(felter.URL || "").trim();
  const name = String(felter.Name || "").trim();

  if (!url || !name) return null;

  return {
    id: record.id || null,
    name,
    platform: String(felter.Platform || "rss").trim().toLowerCase() || "rss",
    type: læsType(felter.Type),
    url,
  };
}

// Kildelisten hentes én gang pr. kørsel og genbruges på tværs af kunder og
// søgeord — ligesom selve feedene.
let cache: { data: Kildeliste; at: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export async function getSources(force = false): Promise<Kildeliste> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!baseId || !process.env.AIRTABLE_TOKEN) {
    return reserveliste("Airtable er ikke konfigureret — bruger reservelisten.");
  }

  const kilder: Kilde[] = [];
  let offset: string | undefined;
  let sider = 0;

  try {
    do {
      const params = new URLSearchParams();
      params.set("filterByFormula", "{Active}=1");
      params.set("pageSize", "100");
      if (offset) params.set("offset", offset);

      const res = await fetch(`${BASE_URL}/${baseId}/${TABEL}?${params.toString()}`, {
        headers: airtableHeaders(),
        cache: "no-store",
      });

      if (res.status === 404) {
        const svar = reserveliste(
          `Tabellen "${TABEL}" findes ikke i Airtable — bruger reservelisten med ` +
            `${FALLBACK_FEEDS.length} kilder. Opret tabellen for selv at kunne styre kilderne.`
        );
        console.warn(`[kilder] ${svar.begrundelse}`);
        cache = { data: svar, at: Date.now() };
        return svar;
      }

      if (!res.ok) {
        const svar = reserveliste(
          `Kunne ikke læse "${TABEL}": ${await beskrivFejl(res)} — bruger reservelisten.`
        );
        console.error(`[kilder] ${svar.begrundelse}`);
        cache = { data: svar, at: Date.now() };
        return svar;
      }

      const data = await res.json();
      for (const r of data.records || []) {
        const kilde = rækkeTilKilde(r);
        if (!kilde) {
          console.warn(`[kilder] Række ${r.id} mangler Name eller URL — springes over.`);
          continue;
        }
        kilder.push(kilde);
      }

      offset = data.offset;
      sider++;
    } while (offset && sider < 20);
  } catch (err) {
    const svar = reserveliste(`Kunne ikke kontakte Airtable (${err}) — bruger reservelisten.`);
    console.error(`[kilder] ${svar.begrundelse}`);
    cache = { data: svar, at: Date.now() };
    return svar;
  }

  // En tom, men eksisterende tabel er næsten altid en fejl — fx at ingen
  // rækker har flueben i Active. Så er reservelisten det rigtige valg.
  if (kilder.length === 0) {
    const svar = reserveliste(
      `Tabellen "${TABEL}" indeholder ingen aktive kilder — bruger reservelisten. ` +
        "Sæt flueben i Active på de kilder, der skal bruges."
    );
    console.warn(`[kilder] ${svar.begrundelse}`);
    cache = { data: svar, at: Date.now() };
    return svar;
  }

  const svar: Kildeliste = {
    kilder,
    fraTabel: true,
    begrundelse: `${kilder.length} aktive kilder hentet fra Airtable-tabellen "${TABEL}".`,
  };
  console.log(`[kilder] ${svar.begrundelse}`);
  cache = { data: svar, at: Date.now() };
  return svar;
}

/**
 * Henter ALLE rækker i Sources — også dem uden flueben i Active.
 *
 * Bruges når tabellen skal fyldes op: en kilde, du bevidst har slået fra,
 * må ikke blive tilføjet igen som en ny række.
 */
export async function getAllSources(): Promise<{ kilder: Kilde[]; aktiv: boolean[] } | null> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!baseId || !process.env.AIRTABLE_TOKEN) return null;

  const kilder: Kilde[] = [];
  const aktiv: boolean[] = [];
  let offset: string | undefined;
  let sider = 0;

  try {
    do {
      const params = new URLSearchParams();
      params.set("pageSize", "100");
      if (offset) params.set("offset", offset);

      const res = await fetch(`${BASE_URL}/${baseId}/${TABEL}?${params.toString()}`, {
        headers: airtableHeaders(),
        cache: "no-store",
      });

      if (!res.ok) {
        console.error(`[kilder] Kunne ikke læse hele ${TABEL}: ${await beskrivFejl(res)}`);
        return null;
      }

      const data = await res.json();
      for (const r of data.records || []) {
        const kilde = rækkeTilKilde(r);
        if (!kilde) continue;
        kilder.push(kilde);
        aktiv.push(Boolean(r.fields?.Active));
      }

      offset = data.offset;
      sider++;
    } while (offset && sider < 20);
  } catch (err) {
    console.error(`[kilder] Kunne ikke læse hele ${TABEL}:`, err);
    return null;
  }

  return { kilder, aktiv };
}

/**
 * Tilføjer nye rækker til Sources.
 *
 * Kalderen har ansvaret for kun at sende kilder, der IKKE findes i forvejen.
 * Der ændres eller slettes aldrig eksisterende rækker herfra.
 */
export async function addSources(
  nye: { name: string; platform: string; type: KildeType; url: string }[]
): Promise<{ tilføjet: number; fejl: string[] }> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!baseId) return { tilføjet: 0, fejl: ["Airtable er ikke konfigureret"] };

  let tilføjet = 0;
  const fejl: string[] = [];

  // Airtable tager op til 10 rækker pr. kald.
  for (let i = 0; i < nye.length; i += 10) {
    const gruppe = nye.slice(i, i + 10);
    try {
      await pace();
      const res = await fetch(`${BASE_URL}/${baseId}/${TABEL}`, {
        method: "POST",
        headers: airtableHeaders(),
        body: JSON.stringify({
          records: gruppe.map((k) => ({
            fields: {
              Name: k.name,
              Platform: k.platform,
              Type: k.type,
              URL: k.url,
              Active: true,
            },
          })),
        }),
      });

      if (!res.ok) {
        fejl.push(`${gruppe.map((g) => g.name).join(", ")}: ${await beskrivFejl(res)}`);
        continue;
      }
      tilføjet += gruppe.length;
    } catch (err) {
      fejl.push(`${gruppe.map((g) => g.name).join(", ")}: ${err}`);
    }
  }

  // Cachen er nu forældet, så næste kørsel henter den friske liste.
  cache = null;

  return { tilføjet, fejl };
}

/**
 * Skriver resultatet af et kildetjek tilbage i Airtable, så det kan ses uden
 * at grave i loggen.
 *
 * Fejler skrivningen, logges det og ellers ingenting — status er en
 * bekvemmelighed, ikke noget overvågningen afhænger af.
 */
export async function updateSourceStatus(
  id: string,
  felter: { status: string; checked: Date; itemCount: number }
): Promise<boolean> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!baseId) return false;

  try {
    await pace();
    const res = await fetch(`${BASE_URL}/${baseId}/${TABEL}/${id}`, {
      method: "PATCH",
      headers: airtableHeaders(),
      body: JSON.stringify({
        fields: {
          LastStatus: felter.status.slice(0, 200),
          LastChecked: felter.checked.toISOString(),
          LastItemCount: felter.itemCount,
        },
      }),
    });

    if (!res.ok) {
      console.error(`[kilder] Kunne ikke skrive status på ${id}: ${await beskrivFejl(res)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[kilder] Kunne ikke skrive status på ${id}:`, err);
    return false;
  }
}
