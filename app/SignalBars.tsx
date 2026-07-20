const BAR_COUNT = 40;
// Faste, "tilfældigt"-udseende mønstre — deterministiske så server og klient stemmer overens.
const SPIKE_EVERY = 7;

export default function SignalBars() {
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => i);

  return (
    <div className="signalBars" aria-hidden="true">
      {bars.map((i) => {
        const isSpike = i % SPIKE_EVERY === 3;
        const delay = (i * 0.11).toFixed(2);
        const dur = (2.4 + (i % 5) * 0.35).toFixed(2);
        return (
          <span
            key={i}
            className={isSpike ? "bar bar--spike" : "bar"}
            style={{
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })}
    </div>
  );
}
