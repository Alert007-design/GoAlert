"use client";

import { useState } from "react";

// Selve formularen, flyttet ud i sin egen fil. Siden omkring den er nu en
// server-komponent, så den kan læse afbryderen PAYMENTS_ENABLED og helt
// undlade at vise formularen, når betaling er slået fra.

export default function AdministrerForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Der opstod en fejl. Prøv igen senere.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Kunne ikke oprette forbindelse. Prøv igen om lidt.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        required
        placeholder="dig@eksempel.dk"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: "100%",
          padding: "0.75rem",
          fontSize: "1rem",
          marginBottom: "1rem",
          boxSizing: "border-box",
        }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          padding: "0.75rem",
          fontSize: "1rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {loading ? "Sender dig videre..." : "Gå til mit abonnement"}
      </button>
      {error && <p style={{ color: "#c0392b", marginTop: "1rem" }}>{error}</p>}
    </form>
  );
}
