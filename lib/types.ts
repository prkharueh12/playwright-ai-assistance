import type { UIMessage } from "ai";

export interface Citation {
  title: string;
  url: string;
}

/** Message metadata carried on each streamed UIMessage — citations are
 * attached server-side once retrieval lands in Phase 4 (empty until then). */
export interface ChatMetadata {
  citations?: Citation[];
}

export type ChatUIMessage = UIMessage<ChatMetadata>;
