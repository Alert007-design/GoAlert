"use client";
import { useState, FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

// Pris i kr/md for i alt N søgeord. 1 er altid gratis.
const PRICE_BY_COUNT: Record<number, number> = {
  1: 0,
  2: 19,
  3: 29,
  4: 39,
  5: 49,
};

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [keywords, setKeywords] = useState<string[]>([""]);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  function updateKeyword(index: number, value: string) {
    setKeywords((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function addKeyword() {
    if (keywords.length >= 5) return;
    setKeywords((prev) => [...prev, ""]);
  }

  function removeKeyword(index: number) {
    setKeywords((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "loading") return;

    const cleanedKeywords = keywords.map((k) => k.trim()).filter(Boolean);
    if (cleanedKeywords.length === 0) {
      setStatus("error");
      setMessage("Angiv mindst ét søgeord.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      if (cleanedKeywords.length === 1) {
        // Gratis flow: opret direkte via /api/signup
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, keywords: cleanedKeywords }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || "Noget gik galt. Prøv igen.");
          return;
        }
        setStatus("success");
        setMessage("Du er noteret. Vi skriver, når du får adgang.");
        setEmail("");
        setKeywords([""]);
      } else {
        // Betalt flow (2-5 søgeord): opret Stripe Checkout-session og redirect.
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, keywords: cleanedKeywords }),
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
          setStatus("error");
          setMessage(data.error || "Kunne ikke starte betaling. Prøv igen.");
          return;
        }
        window.location.href = data.url;
      }
    } catch {
      setStatus("error");
      setMessage("Kunne ikke oprette forbindelse. Prøv igen om lidt.");
    }
  }

  if (status === "success") {
    return (
      <p className="signupSuccess" role="status">
        {message}
      </p>
    );
  }

  const price = PRICE_BY_COUNT[keywords.length] ?? 0;

  return (
    <form className="signupForm" onSubmit={handleSubmit} noValidate>
      <label htmlFor="email" className="signupLabel">
        Din e-mail
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        placeholder="dig@eksempel.dk"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="signupInput"
        disabled={status === "loading"}
      />

      <label className="signupLabel" style={{ marginTop: "12px" }}>
        Hvad vil du overvåge? (op til 5 søgeord)
      </label>
      {keywords.map((kw, i) => (
        <div className="signupRow" key={i}>
          <input
            type="text"
            required={i === 0}
            placeholder={i === 0 ? "F.eks. dit navn eller firma" : "Endnu et søgeord"}
            value={kw}
            onChange={(e) => updateKeyword(i, e.target.value)}
            className="signupInput"
            disabled={status === "loading"}
          />
          {i > 0 && (
            <button
              type="button"
              className="signupButton"
              onClick={() => removeKeyword(i)}
              disabled={status === "loading"}
              aria-label="Fjern søgeord"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {keywords.length < 5 && (
        <button
          type="button"
          className="signupButton"
          onClick={addKeyword}
          disabled={status === "loading"}
          style={{ marginTop: "8px" }}
        >
          + Tilføj søgeord
        </button>
      )}

      <p className="heroFormNote" style={{ marginTop: "10px" }}>
        {keywords.length === 1
          ? "Det første søgeord er gratis."
          : `${keywords.length} søgeord: ${price} kr./md. (første er gratis, herefter betaling)`}
        {" "}Har du brug for flere end 5 søgeord? Skriv til os.
      </p>

      <button
        type="submit"
        className="signupButton"
        disabled={status === "loading"}
        style={{ marginTop: "10px" }}
      >
        {status === "loading"
          ? "Sender…"
          : keywords.length === 1
          ? "Få adgang"
          : "Gå til betaling"}
      </button>

      {status === "error" && (
        <p className="signupError" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
