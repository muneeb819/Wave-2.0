import { AudioLines, UserRound } from "lucide-react";

export type MessageRole = "user" | "assistant";

export function ChatAvatar({ role }: { role: MessageRole }) {
  return (
    <span className={`chat-avatar ${role}`}>
      {role === "assistant" ? <AudioLines /> : <UserRound />}
    </span>
  );
}
