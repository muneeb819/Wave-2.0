export function LiveKitLogo({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`livekit-logo ${small ? "small" : ""}`}
      aria-label="Wave 2.0"
    >
      <img src="./wave2.0.png" alt="Wave 2.0" className="wave2-logo-image" />
      {!small && <span>Wave 2.0</span>}
    </span>
  );
}
