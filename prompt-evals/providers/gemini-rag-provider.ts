import { generateText } from "ai";
import { getModel, DEFAULT_MODELS } from "../../lib/providers";
import { buildSystemPrompt, wrapUserQuery } from "../../lib/prompts";
import { buildRagContext } from "../../lib/rag";
import { calculateCost } from "./pricing";

const MODEL_ID = `google:${DEFAULT_MODELS.google}`;

interface GeminiRagProviderResponse {
  output: string;
  cost?: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  metadata: {
    citationCount: number;
    citations: { title: string; url: string }[];
    retrievedChunkCount: number;
    // Joined retrieved-chunk text. Lives under metadata (not a top-level
    // `context` field) because promptfoo's contextTransform only sees
    // providerResponse.metadata — the top-level output field is reduced to
    // the plain answer string by the time contextTransform runs, so sibling
    // fields on the raw response object aren't reachable from it.
    context: string;
  };
  error?: string;
}

/**
 * Runs a query through the same RAG pipeline as /api/chat — buildRagContext →
 * buildSystemPrompt → the app's own getModel("google", ...) — but with
 * generateText instead of streamText, since evals only need the final text.
 * Returns cost + tokenUsage (for the benchmark suite's cost/latency
 * assertions) and the retrieved chunk text under metadata.context (for any
 * future contextTransform-based assertion).
 */
export default class GeminiRagProvider {
  id() {
    return "gemini-rag-provider";
  }

  async callApi(prompt: string): Promise<GeminiRagProviderResponse> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return {
        output: "",
        metadata: { citationCount: 0, citations: [], retrievedChunkCount: 0, context: "" },
        error:
          "GOOGLE_API_KEY is not set. Add it to .env, then run evals via the " +
          "npm run eval:* scripts (they load .env through dotenv-cli).",
      };
    }

    const query = prompt.trim();
    const { promptChunks, citations } = await buildRagContext(query);
    const system = buildSystemPrompt(promptChunks);
    const model = getModel("google", apiKey);

    const { text, usage } = await generateText({ model, system, prompt: wrapUserQuery(query) });

    const context = promptChunks
      .map((chunk) => `[${chunk.heading}](${chunk.url})\n${chunk.text}`)
      .join("\n\n---\n\n");

    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;

    return {
      output: text,
      cost: calculateCost(MODEL_ID, inputTokens, outputTokens),
      tokenUsage: {
        prompt: inputTokens,
        completion: outputTokens,
        total: usage.totalTokens ?? inputTokens + outputTokens,
      },
      metadata: {
        citationCount: citations.length,
        citations,
        retrievedChunkCount: promptChunks.length,
        context,
      },
    };
  }
}
