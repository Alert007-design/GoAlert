// Datohåndtering for scannet.
//
// Baggrund: kilderne leverer datoer i mindst tre former:
//   1. RFC 822 med tidszone      (RSS: "Sat, 20 Sep 2026 08:14:00 +0200")
//   2. ISO 8601 med tidszone     ("2026-09-20T08:14:00Z")
//   3. ISO 8601 UDEN tidszone    (Folketinget: "2026-09-20T00:00:00")
//
// Form 3 er faldgruben. JavaScript tolker en dato uden tidszone efter
// serverens egen tidszone. Den er UTC på Vercel og noget andet lokalt, så
// den samme dato ville betyde to forskellige tidspunkter afhængigt af hvor
// koden kører. Derfor tolkes form 3 eksplicit som dansk tid og regnes om til
// UTC her — ét sted, i stedet for i hver enkelt kilde.
//
// Desuden: mange danske datakilder (særligt Folketinget) angiver kun DAGEN
// og sætter klokkeslættet til midnat. Det er ikke et rigtigt
// udgivelsestidspunkt, og det skal ikke behandles som ét. Sådan en dato
// markeres med precision "dag", så 24-timers-reglen kan tage stilling til den
// bevidst i stedet for at tro på et klokkeslæt, der aldrig er blevet målt.

const DK_TZ = "Europe/Copenhagen";

export type DatePrecision = "exact" | "day";

export type ParsedDate = {
  /** Altid et rigtigt UTC-tidspunkt. */
  date: Date;
  /**
   * "exact" = kilden oplyste et klokkeslæt vi kan stole på.
   * "day"   = kilden oplyste kun en dato; tidspunktet er sat til døgnets
   *           begyndelse i dansk tid, hvilket er det tidligst mulige.
   */
  precision: DatePrecision;
};

/** Europe/Copenhagens UTC-forskydning i minutter på et givet tidspunkt. */
function copenhagenOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DK_TZ,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(utcMs));

  const name = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+00:00";
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;

  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Regner et vægur-tidspunkt i dansk tid om til UTC.
 *
 * Forskydningen slås op to gange, fordi sommertidsskiftet gør det første
 * gæt forkert for tidspunkter tæt på selve skiftet.
 */
function fromCopenhagenWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstGuess = copenhagenOffsetMinutes(asIfUtc);
  let utcMs = asIfUtc - firstGuess * 60_000;

  const secondGuess = copenhagenOffsetMinutes(utcMs);
  if (secondGuess !== firstGuess) {
    utcMs = asIfUtc - secondGuess * 60_000;
  }

  return new Date(utcMs);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITHOUT_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/**
 * Oversætter en rå datotekst fra en kilde til et UTC-tidspunkt.
 *
 * Returnerer null, hvis datoen mangler eller ikke kan læses. Kaldere SKAL
 * kassere den slags indhold — det må aldrig få "nu" som dato, for så ville
 * gammelt indhold snige sig ind i en 24-timers-mail.
 */
export function parsePublishedAt(raw: string | null | undefined): ParsedDate | null {
  if (!raw) return null;

  const text = String(raw).trim();
  if (!text) return null;

  const dateOnly = text.match(DATE_ONLY);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return {
      date: fromCopenhagenWallClock(Number(y), Number(mo), Number(d), 0, 0, 0),
      precision: "day",
    };
  }

  const naive = text.match(ISO_WITHOUT_ZONE);
  if (naive) {
    const [, y, mo, d, h, mi, s] = naive;
    const hour = Number(h);
    const minute = Number(mi);
    const second = Number(s || 0);
    const date = fromCopenhagenWallClock(
      Number(y),
      Number(mo),
      Number(d),
      hour,
      minute,
      second
    );
    // Midnat på klokkeslættet betyder i praksis "vi kender kun dagen".
    const isMidnight = hour === 0 && minute === 0 && second === 0;
    return { date, precision: isMidnight ? "day" : "exact" };
  }

  // Alt andet (RFC 822, ISO med Z eller +02:00) kan Date selv klare korrekt,
  // fordi tidszonen står i teksten.
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;

  return { date: parsed, precision: "exact" };
}

/** Til logning: "2026-09-20T06:14:00.000Z" bliver til "20/09 08:14 dansk tid". */
export function toDanishLabel(date: Date): string {
  return date.toLocaleString("da-DK", {
    timeZone: DK_TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
