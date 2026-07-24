import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  smoothStream,
  streamText,
  toUIMessageStream,
  type ToolSet,
  type UIMessage,
} from "ai";
import { getModel, isSupportedProvider } from "@/lib/providers";
import { buildSystemPrompt } from "@/lib/prompts";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { buildRagContext } from "@/lib/rag";
import type { ChatMetadata } from "@/lib/types";

// Basic request-size cap (blueprint §7). Chat payloads are short text; 100KB
// comfortably covers a long conversation history without allowing abuse.
const MAX_REQUEST_BYTES = 100_000;

function jsonError(message: string, status: number, extraHeaders?: HeadersInit) {
  return Response.json({ error: message }, { status, headers: extraHeaders });
}

function getLastUserQuery(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    return messages[i].parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

export async function POST(req: Request) {
  const clientKey = getClientKey(req.headers);
  const { allowed, retryAfterSeconds } = checkRateLimit(clientKey);
  if (!allowed) {
    return jsonError("Too many requests. Please slow down.", 429, {
      "Retry-After": String(retryAfterSeconds),
    });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonError("Request body too large.", 413);
  }

  const provider = req.headers.get("x-provider") ?? "";
  if (!isSupportedProvider(provider)) {
    return jsonError(
      "Unsupported or missing provider. Set the x-provider header to a supported value.",
      400
    );
  }

  // Never log this value — it is the caller's own key, forwarded per-request
  // and used for this call only (blueprint §3). Not persisted server-side.
  const apiKey = req.headers.get("x-provider-key") ?? "";
  if (!apiKey.trim()) {
    return jsonError("Missing x-provider-key header.", 401);
  }

  const bodyText = await req.text();
  if (bodyText.length > MAX_REQUEST_BYTES) {
    return jsonError("Request body too large.", 413);
  }

  let messages: UIMessage[];
  try {
    ({ messages } = JSON.parse(bodyText) as { messages: UIMessage[] });
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError("Request body must include a non-empty messages array.", 400);
  }

  const query = getLastUserQuery(messages);
  let promptChunks: Awaited<ReturnType<typeof buildRagContext>>["promptChunks"] = [];
  let citations: Awaited<ReturnType<typeof buildRagContext>>["citations"] = [];
  try {
    ({ promptChunks, citations } = await buildRagContext(query));
  } catch (error) {
    console.error("RAG retrieval failed:", error instanceof Error ? error.message : error);
    return jsonError(
      "The documentation index isn't available. Run the ingestion pipeline (npm run ingest) and try again.",
      500
    );
  }
  const model = getModel(provider, apiKey);

  const result = streamText({
    model,
    system: buildSystemPrompt(promptChunks),
    messages: await convertToModelMessages(messages),
    // Paces raw provider deltas into word-sized chunks server-side, so the
    // client re-renders (and re-parses markdown for) the streaming message
    // at a steady, coalesced rate instead of on whatever arbitrary chunk
    // boundaries the provider happens to use.
    experimental_transform: smoothStream(),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<ToolSet, UIMessage<ChatMetadata>>({
      stream: result.stream,
      messageMetadata: ({ part }) => {
        // Citations are known up front from retrieval, so attach them as
        // soon as the message starts rather than waiting for it to finish
        // (blueprint §7: "alongside the stream").
        if (part.type === "start") {
          return { citations };
        }
      },
      onError: (error) => {
        // Surfaced to the client as a stream error part (useChat's `error`
        // state) rather than an HTTP status, since the failure happens after
        // the 200 response has already started streaming. Forwarding the
        // real message is safe here — it's the caller's own key/account
        // that failed (e.g. invalid key, quota), never a server secret.
        if (error instanceof Error) return error.message;
        return "The model provider returned an error. Check your API key and try again.";
      },
    }),
  });
}
