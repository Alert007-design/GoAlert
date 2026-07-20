"use client";

import { useState, FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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

  return (
    <form className="signupForm" onSubmit={handleSubmit} noValidate>
      <label htmlFor="email" className="signupLabel">
        Din e-mail
      </label>
      <div className="signupRow">
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
        <button
          type="submit"
          className="signupButton"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Sender…" : "Få adgang"}
        </button>
      </div>
      {status === "error" && (
        <p className="signupError" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
