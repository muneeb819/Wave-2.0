import type { ReactNode } from "react";

export function Pill({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`pill ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
