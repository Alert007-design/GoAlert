import Stripe from "stripe";

/**
 * Stripe-forbindelsen, oprettet først når den skal bruges.
 *
 * Tidligere blev den oprettet i det øjeblik filen blev indlæst. Stripe siger
 * nej, hvis nøglen mangler, og under en build indlæses alle filer uden at
 * miljøvariablerne er til stede. Resultatet var, at `npm run build` fejlede
 * med "Neither apiKey nor config.authenticator provided", så projektet
 * hverken kunne bygges eller testes lokalt.
 *
 * Betalingsforløbet er ikke ændret — kun tidspunktet hvor forbindelsen
 * oprettes. Nu sker det ved første rigtige kald til en betalingsrute.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY mangler");
  }

  cached = new Stripe(key);
  return cached;
}

/** Er Stripe overhovedet sat op i dette miljø? */
export function harStripeNøgle(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
