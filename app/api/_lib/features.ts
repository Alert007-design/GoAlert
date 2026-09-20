// Centrale afbrydere.
//
// Gossip Alert bruges i dag privat. Betaling har aldrig været aktiveret,
// Stripe er kun sat op i sandbox, og der er ingen kunder. Derfor er begge
// funktioner slået FRA som standard — de skal tændes aktivt, ikke slukkes
// aktivt. Glemmer nogen at sætte en miljøvariabel, er resultatet den sikre
// tilstand, ikke den åbne.
//
// Ingen Stripe-kode er slettet. Alt kan tændes igen ved at sætte variablen.

/** Skal kun tælle som "til", hvis der står præcis "true". */
function erSlåetTil(værdi: string | undefined): boolean {
  return værdi?.trim().toLowerCase() === "true";
}

/**
 * Betalingsfunktionen: Stripe checkout, kundeportal og webhook, priser på
 * forsiden og "opgrader"-beskeder.
 *
 * Er den fra, må intet kalde Stripe, og ingen tekst om priser eller
 * abonnement må vises nogen steder.
 */
export function paymentsEnabled(): boolean {
  return erSlåetTil(process.env.PAYMENTS_ENABLED);
}

/**
 * Tilmeldingsformularen på forsiden og /api/signup.
 *
 * Er den fra, kan fremmede ikke oprette sig selv som aktive kunder. Egne
 * søgeord tilføjes i stedet direkte i Airtable-tabellen Customers.
 */
export function signupsEnabled(): boolean {
  return erSlåetTil(process.env.SIGNUPS_ENABLED);
}

/**
 * Hvor mange søgeord én konto må have, når betaling er slået fra.
 *
 * Uden betaling er der ingen grund til at begrænse til ét søgeord, som det
 * betalte flow gjorde. Fem er det, formularen og prismodellen altid har
 * regnet med som loft.
 */
export const MAX_SØGEORD_UDEN_BETALING = 5;
