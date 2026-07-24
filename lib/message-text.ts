import type { ChatUIMessage } from "@/lib/types";

export function getMessageText(message: ChatUIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
