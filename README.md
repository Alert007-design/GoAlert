# Gossip Alert — v2

Frisk start på landing- og tilmeldingssiden. Next.js (app router) + TypeScript, ingen eksterne UI-biblioteker.

## Struktur

- `app/page.tsx` — selve siden (hero, "sådan virker det", CTA)
- `app/SignupForm.tsx` — tilmeldingsformularen (client component)
- `app/SignalBars.tsx` — den animerede "signal"-grafik i hero'en
- `app/api/signup/route.ts` — modtager tilmeldinger. Logger lige nu bare
  e-mailen til Vercels logs — næste skridt er at koble den til f.eks.
  Resend, Airtable eller en database, så I faktisk kan se og bruge listen.
- `app/globals.css` — al styling, ingen CSS-framework

## Køre lokalt

```
npm install
npm run dev
```

## Deploy

Push til GitHub, og importér repoet i Vercel — det virker uden yderligere
opsætning. Ingen miljøvariabler er påkrævet endnu.
