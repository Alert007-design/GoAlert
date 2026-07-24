import SignalBars from "./SignalBars";
import SignupForm from "./SignupForm";
import { fetchTopDanishStories, TopStory } from "./api/cron/scan/sources";

const STEPS = [
  {
    n: "1",
    title: "Opret dine søgeord",
    body: "Skriv din e-mail og det, du vil holde øje med — dit navn, din virksomheds navn eller et andet emne. Det tager under et minut.",
  },
  {
    n: "2",
    title: "Vi overvåger danske kilder",
    body: "Gossip Alert scanner løbende et voksende udvalg af offentligt tilgængelige danske nyhedsmedier for nye omtaler, der matcher dine søgeord.",
  },
  {
    n: "3",
    title: "Modtag en overskuelig mail",
    body: "Finder vi noget nyt, får du besked med det samme — med links direkte til kilderne. Finder vi intet, hører du også fra os, så du ved, at overvågningen kører.",
  },
];

const EXPLAINERS = [
  {
    title: "Hvad overvåger vi?",
    body: "Gossip Alert holder øje med et voksende udvalg af offentligt og teknisk tilgængelige danske nyhedskilder. Vi udvider løbende dækningen, men ingen tjeneste kan garantere at fange alt, der bliver skrevet.",
  },
  {
    title: "Sådan opretter du en overvågning",
    body: "Skriv din e-mail og mindst ét søgeord i formularen ovenfor. Det er gratis at komme i gang, og du skal ikke oplyse kortoplysninger for at prøve tjenesten.",
  },
  {
    title: "Hvornår får du besked?",
    body: "Gossip Alert scanner automatisk hver dag. Du får altid en mail — både når vi finder noget nyt, og når vi ikke gør, så du ved forskel på \"intet fundet\" og en teknisk fejl.",
  },
  {
    title: "Kilder du kan stole på",
    body: "Hver omtale i din mail linker direkte til den oprindelige artikel, så du selv kan læse den i sin fulde sammenhæng — vi gengiver aldrig hele artikler.",
  },
];

const PRICE_TIERS = [
  { label: "1. søgeord", value: "Gratis", unit: "" },
  { label: "2. søgeord", value: "19 kr", unit: "/md" },
  { label: "3. søgeord", value: "29 kr", unit: "/md" },
  { label: "4. søgeord", value: "39 kr", unit: "/md" },
  { label: "5. søgeord", value: "49 kr", unit: "/md" },
];

// Henter dagens 3 historier server-side. Fejler Google News' feed (fx en
// midlertidig netværksfejl), skal det ikke vælte hele forsiden — panelet
// vises da bare tomt/uden historier for den visning.
async function getTodaysStories(): Promise<TopStory[]> {
  try {
    return await fetchTopDanishStories(3);
  } catch (err) {
    console.error("Kunne ikke hente dagens historier til forsiden:", err);
    return [];
  }
}

export default async function Home() {
  const stories = await getTodaysStories();

  return (
    <main>
      <header className="topbar">
        <div className="wrap topbarInner">
          <span className="logo">
            Gossip<span className="logoAccent">Alert</span>
          </span>
          <a href="#adgang" className="topbarCta">
            Få adgang
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="wrap heroGrid">
          <div className="heroCopy">
            <p className="eyebrow">Early-warning for dit omdømme</p>
            <h1>
              Vid det,
              <br />
              før alle andre gør.
            </h1>
            <p className="heroLead">
              Gossip Alert overvåger, hvad der bliver sagt om dig eller din
              virksomhed på nettet — og advarer dig, mens et rygte stadig kan
              stoppes. Ikke dagen efter. Med det samme.
            </p>
            <div id="adgang" className="heroForm">
              <SignupForm />
              <p className="heroFormNote">
                Gratis at skrive dig op. Ingen kortoplysninger. Uforpligtende.
              </p>
            </div>
          </div>

          <div className="heroPanel">
            <div className="panelHead">
              <span className="panelDot" />
              <span className="panelLabel">Danmark lige nu</span>
            </div>
            <SignalBars />
            {stories.length > 0 ? (
              <ul className="storyList">
                {stories.map((story) => (
                  <li className="storyItem" key={story.url}>
                    <a
                      href={story.url}
                      className="storyTitle"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {story.title}
                    </a>
                    <div className="storyMeta">{story.source}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="storyFallback">
                Dagens historier kunne ikke hentes lige nu — prøv at
                genindlæse siden.
              </p>
            )}
            <p className="panelNote">Opdateres én gang i døgnet.</p>
          </div>
        </div>
      </section>

      <section className="explainer">
        <div className="wrap">
          <p className="eyebrow">Hvad er Gossip Alert?</p>
          <div className="explainerGrid">
            {EXPLAINERS.map((item) => (
              <div className="explainerBlock" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="process">
        <div className="wrap">
          <p className="eyebrow">Sådan virker det</p>
          <div className="processGrid">
            {STEPS.map((step) => (
              <div className="processStep" key={step.n}>
                <span className="processN">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing">
        <div className="wrap">
          <p className="eyebrow">Pris</p>
          <h2 className="pricingTitle">
            Start gratis. Betal kun, hvis du vil overvåge mere.
          </h2>
          <p className="pricingIntro">
            Dit første søgeord er gratis, uden binding. Vil du overvåge mere
            end ét navn, emne eller din virksomhed, kan du til enhver tid
            tilføje flere søgeord til en fast, lav pris pr. måned.
          </p>
          <div className="pricingGrid">
            {PRICE_TIERS.map((tier, i) => (
              <div
                className={`priceCard${i === 0 ? " priceCard--free" : ""}`}
                key={tier.label}
              >
                <p className="priceLabel">{tier.label}</p>
                <p className="priceValue">
                  {tier.value}
                  <span className="priceUnit">{tier.unit}</span>
                </p>
              </div>
            ))}
          </div>
          <ul className="pricingNotes">
            <li>Din første overvågning er gratis — ingen kortoplysninger krævet.</li>
            <li>Du vælger selv, om og hvornår du vil betale for flere søgeord.</li>
            <li>Det er helt uforpligtende at prøve tjenesten.</li>
            <li>Et betalt abonnement kan opsiges når som helst, uden binding.</li>
            <li>Har du brug for flere end 5 søgeord? Skriv til os.</li>
          </ul>
        </div>
      </section>

      <section className="closing">
        <div className="wrap closingInner">
          <h2>Rygter venter ikke. Det bør du heller ikke.</h2>
          <a href="#adgang" className="closingCta">
            Skriv dig op nu
          </a>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap footerInner">
          <span>Gossip Alert</span>
          <nav className="footerLinks">
            <a href="/privatliv">Privatlivspolitik</a>
            <a href="/vilkaar">Vilkår</a>
            <a href="mailto:kontakt@gossipalert.dk">Kontakt</a>
          </nav>
          <span className="footerMuted">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}
