import { buildRagContext } from "../../lib/rag";
import { buildSystemPrompt } from "../../lib/prompts";

interface BuildRagPromptParams {
  vars: { query?: string };
}

/**
 * Shared prompt function for the multi-provider benchmark — runs the real
 * RAG pipeline (buildRagContext → buildSystemPrompt, same as /api/chat) and
 * returns a JSON-stringified chat-message array. promptfoo's built-in chat
 * providers (confirmed for both OpenAI and Anthropic, not just Gemini —
 * parseChatPrompt is shared code) parse this generically and map the
 * `system` role entry to that provider's actual system parameter.
 *
 * Unlike gemini-rag-provider.ts, this does NOT call getModel()/use the
 * app's configured default model — the benchmark deliberately compares each
 * provider's cheapest available tier via built-in provider IDs in the
 * config, not what's actually live in production.
 */
export default async function buildRagPrompt({ vars }: BuildRagPromptParams): Promise<string> {
  const query = (vars.query ?? "").trim();
  const { promptChunks } = await buildRagContext(query);
  const system = buildSystemPrompt(promptChunks);

  return JSON.stringify([
    { role: "system", content: system },
    { role: "user", content: query },
  ]);
}
