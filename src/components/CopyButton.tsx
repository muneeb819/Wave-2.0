import { Check, Copy } from "lucide-react";

export function CopyButton({
  onClick,
  label = "Copy",
  copied = false,
}: {
  onClick: () => void;
  label?: string;
  copied?: boolean;
}) {
  return (
    <button
      className="icon-button copy-button"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {copied ? <Check /> : <Copy />}
    </button>
  );
}
