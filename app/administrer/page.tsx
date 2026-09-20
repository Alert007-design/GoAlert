import AdministrerForm from "./AdministrerForm";
import { paymentsEnabled } from "../api/_lib/features";

// Siden findes kun for at åbne Stripes kundeportal. Er betaling slået fra,
// er der intet abonnement at administrere, og siden siger det ligeud i
// stedet for at vise en formular, der alligevel ville fejle.

export default function AdministrerPage() {
  const betalingTil = paymentsEnabled();

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "4rem 1.5rem",
        fontFamily: "sans-serif",
      }}
    >
      {betalingTil ? (
        <>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Administrer dit abonnement
          </h1>
          <p style={{ color: "#555", marginBottom: "1.5rem" }}>
            Indtast den e-mail, du har tilmeldt dig med, så sender vi dig videre
            til en sikker side, hvor du kan se og opsige dit abonnement.
          </p>
          <AdministrerForm />
        </>
      ) : (
        <>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Abonnement er ikke aktivt
          </h1>
          <p style={{ color: "#555" }}>
            Gossip Alert kører uden betaling lige nu, så der er ikke noget
            abonnement at administrere. Der bliver ikke trukket penge nogen
            steder.
          </p>
          <p style={{ color: "#555", marginTop: "1rem" }}>
            <a href="/">Tilbage til forsiden</a>
          </p>
        </>
      )}
    </main>
  );
}
