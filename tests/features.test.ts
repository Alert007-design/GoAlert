// Beviser, at afbryderne er slået FRA som standard, og at ingen mail
// indeholder betalings- eller abonnementstekst, når betaling er fra.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { paymentsEnabled, signupsEnabled } from "../app/api/_lib/features";
import {
  alertWithResultsEmail,
  alertNoResultsEmail,
  welcomeEmail,
  type EnrichedFoundItem,
} from "../app/api/_lib/email-templates";

const oprindelig = {
  payments: process.env.PAYMENTS_ENABLED,
  signups: process.env.SIGNUPS_ENABLED,
};

beforeEach(() => {
  delete process.env.PAYMENTS_ENABLED;
  delete process.env.SIGNUPS_ENABLED;
});

afterEach(() => {
  if (oprindelig.payments === undefined) delete process.env.PAYMENTS_ENABLED;
  else process.env.PAYMENTS_ENABLED = oprindelig.payments;
  if (oprindelig.signups === undefined) delete process.env.SIGNUPS_ENABLED;
  else process.env.SIGNUPS_ENABLED = oprindelig.signups;
});

// --- standardtilstand ------------------------------------------------------

test("begge afbrydere er slået FRA, når intet er sat", () => {
  assert.equal(paymentsEnabled(), false);
  assert.equal(signupsEnabled(), false);
});

test("kun præcis 'true' tænder en afbryder", () => {
  for (const værdi of ["false", "0", "ja", "1", "TRUE ", "", " "]) {
    process.env.PAYMENTS_ENABLED = værdi;
    assert.equal(
      paymentsEnabled(),
      værdi.trim().toLowerCase() === "true",
      `"${værdi}" gav et uventet resultat`
    );
  }

  process.env.PAYMENTS_ENABLED = "true";
  assert.equal(paymentsEnabled(), true);
});

// --- mails uden betaling ---------------------------------------------------

const item: EnrichedFoundItem = {
  title: "En omtale",
  url: "https://dr.dk/nyheder/1",
  source: "DR",
  publishedAt: "2026-09-20T08:00:00Z",
};

function alleMails() {
  return [
    alertWithResultsEmail({
      recipientEmail: "mig@eksempel.dk",
      keywords: ["mit navn"],
      itemsByKeyword: { "mit navn": [item] },
    }),
    alertNoResultsEmail({
      recipientEmail: "mig@eksempel.dk",
      keywords: ["mit navn"],
    }),
    welcomeEmail({ recipientEmail: "mig@eksempel.dk", keywords: ["mit navn"] }),
  ];
}

test("ingen mail linker til /administrer, når betaling er fra", () => {
  for (const mail of alleMails()) {
    assert.ok(
      !mail.html.includes("/administrer"),
      `HTML i "${mail.subject}" linker stadig til /administrer`
    );
    assert.ok(
      !mail.text.includes("/administrer"),
      `Tekstudgaven af "${mail.subject}" linker stadig til /administrer`
    );
  }
});

test("ingen mail nævner abonnement, betaling eller kundeforhold, når betaling er fra", () => {
  const forbudteOrd = ["abonnement", "betaling", "betalende", "kr.", "opgrader", "kunde hos os"];

  for (const mail of alleMails()) {
    const samlet = `${mail.subject} ${mail.html} ${mail.text}`.toLowerCase();
    for (const ord of forbudteOrd) {
      assert.ok(
        !samlet.includes(ord),
        `"${mail.subject}" indeholder ordet "${ord}", selvom betaling er slået fra`
      );
    }
  }
});

test("med betaling slået til kommer abonnementslinket tilbage", () => {
  process.env.PAYMENTS_ENABLED = "true";
  const mail = alertNoResultsEmail({
    recipientEmail: "mig@eksempel.dk",
    keywords: ["mit navn"],
  });
  assert.ok(mail.html.includes("/administrer"));
});

test("selve omtalen vises stadig, selv om betalingsteksterne er væk", () => {
  const mail = alertWithResultsEmail({
    recipientEmail: "mig@eksempel.dk",
    keywords: ["mit navn"],
    itemsByKeyword: { "mit navn": [item] },
  });
  assert.ok(mail.html.includes("En omtale"));
  assert.ok(mail.html.includes("https://dr.dk/nyheder/1"));
});
