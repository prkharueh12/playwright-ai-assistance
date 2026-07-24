import { retrieveRelevantChunks } from "@/lib/retrieval";
import type { RetrievedChunk as PromptChunk } from "@/lib/prompts";
import type { Citation } from "@/lib/types";

export interface RagContext {
  promptChunks: PromptChunk[];
  citations: Citation[];
}

// Cosine similarity below which the top retrieved chunk is treated as noise
// rather than a real match — calibrated against this corpus: genuinely
// on-topic queries (even vague ones like "click" or "screenshot") scored
// 0.37-0.66, while off-topic/chitchat queries ("what's the weather",
// "hello") topped out around 0.24. 0.3 sits with margin on both sides.
// Below it we skip both prompt-context injection and citations entirely —
// showing "Sources" under a refusal or a one-line greeting was the bug this
// gate fixes. Retrieval always returns its top-k regardless of relevance
// (cosine similarity has no built-in cutoff), so something has to draw
// this line.
const MIN_RELEVANCE_SCORE = 0.3;

/** Retrieves and shapes context for a single turn: chunks for prompt
 * injection (lib/prompts.ts) and deduplicated citations for the UI. Returns
 * both empty when the query doesn't look Playwright-related enough for the
 * retrieved chunks to be a real match. */
export async function buildRagContext(query: string): Promise<RagContext> {
  const results = await retrieveRelevantChunks(query);
  const chunks = results.length > 0 && results[0].score >= MIN_RELEVANCE_SCORE ? results : [];

  const promptChunks: PromptChunk[] = chunks.map((chunk) => ({
    heading: chunk.heading,
    url: chunk.url,
    text: chunk.text,
  }));

  const citations: Citation[] = [];
  const seenUrls = new Set<string>();
  for (const chunk of chunks) {
    if (seenUrls.has(chunk.url)) continue;
    seenUrls.add(chunk.url);
    citations.push({ title: chunk.heading, url: chunk.url });
  }

  return { promptChunks, citations };
}
