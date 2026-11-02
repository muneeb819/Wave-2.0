const BAR_HEIGHTS = [
  12, 22, 37, 54, 33, 64, 44, 76, 50, 67, 38, 57, 31, 45, 24, 14, 9,
];

export function Equalizer({
  active = false,
  small = false,
}: {
  active?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`equalizer ${active ? "animated" : ""} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {BAR_HEIGHTS.map((height, i) => (
        <span
          key={i}
          style={{
            height: `${height}%`,
            animationDelay: `${i * -0.13}s`,
            animationDuration: `${0.65 + (i % 4) * 0.17}s`,
          }}
        />
      ))}
    </div>
  );
}
