import { readFileSync } from "node:fs";
import { join } from "node:path";

// Kept as a standalone file (rather than an inline template string) so it can
// grow with more guardrail rules (adversarial prompting, injection
// resistance, etc.) without bloating this module, and so it can be pointed
// to directly by external prompt-eval tooling later without extracting it
// from TS source.
const BASE_SYSTEM_PROMPT = readFileSync(
  join(process.cwd(), "prompts", "system.md"),
  "utf-8"
).trim();

export interface RetrievedChunk {
  heading: string;
  url: string;
  text: string;
}

/**
 * Builds the system prompt. `chunks` is empty until Phase 4 wires up
 * retrieval — at that point each chunk is injected as a labeled, delimited
 * section ahead of the base rules per blueprint §6.
 */
export function buildSystemPrompt(chunks: RetrievedChunk[] = []): string {
  if (chunks.length === 0) {
    return BASE_SYSTEM_PROMPT;
  }

  const context = chunks
    .map(
      (chunk, index) =>
        `[Source ${index + 1}: ${chunk.heading}](${chunk.url})\n${chunk.text}`
    )
    .join("\n\n---\n\n");

  return `${BASE_SYSTEM_PROMPT}\n\nDocumentation context:\n\n${context}`;
}
