import SignalBars from "./SignalBars";
import SignupForm from "./SignupForm";

const FEED_ITEMS = [
  { time: "14:32:07", text: "Ny omtale registreret — lokal Facebook-gruppe" },
  { time: "14:29:51", text: "Stigende aktivitet — kommentarspor på nyhedsartikel" },
  { time: "14:24:18", text: "Ny omtale registreret — anonymt forum" },
  { time: "14:19:44", text: "Ændring i tone — Instagram-kommentarer" },
  { time: "14:11:02", text: "Ny omtale registreret — Reddit-tråd" },
  { time: "14:03:37", text: "Stigende aktivitet — LinkedIn-opslag" },
  { time: "13:57:20", text: "Ny omtale registreret — lokalt nyhedsmedie" },
];

const STEPS = [
  {
    n: "1",
    title: "Overvåg",
    body: "Gossip Alert holder øje med de steder, hvor dit navn eller din virksomhed bliver nævnt — offentligt tilgængelige grupper, fora, kommentarspor og nyheder.",
  },
  {
    n: "2",
    title: "Opdag",
    body: "Når aktiviteten omkring dig stiger, eller tonen ændrer sig, fanger systemet det — ofte før det bliver til en historie, der spreder sig.",
  },
  {
    n: "3",
    title: "Advar",
    body: "Du får besked med det samme: hvad der bliver sagt, hvor det sker, og hvor hurtigt det udvikler sig — så du kan nå at reagere.",
  },
];

export default function Home() {
  const feedLoop = [...FEED_ITEMS, ...FEED_ITEMS];

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
                Gratis at skrive dig op. Ingen kortoplysninger.
              </p>
            </div>
          </div>

          <div className="heroPanel">
            <div className="panelHead">
              <span className="panelDot" />
              <span className="panelLabel">Live overvågning</span>
            </div>
            <SignalBars />
            <ul className="feed">
              {feedLoop.map((item, i) => (
                <li key={i} className="feedItem">
                  <span className="feedTime">{item.time}</span>
                  <span className="feedText">{item.text}</span>
                </li>
              ))}
            </ul>
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
          <span className="footerMuted">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}
