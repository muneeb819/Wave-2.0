import type { ReactNode } from "react";
import { AudioLines, Braces } from "lucide-react";

export function EmptyState({
  icon = "session",
  title,
  children,
}: {
  icon?: "session" | "search";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        {icon === "session" ? <AudioLines /> : <Braces />}
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
