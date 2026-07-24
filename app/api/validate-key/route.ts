import { isSupportedProvider, type ProviderId } from "@/lib/providers";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";

// A cheap "list models" call per provider — never a real generation request,
// so validating a key doesn't burn the user's quota or tokens.
const VALIDATION_ENDPOINTS: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/models",
  google: "https://generativelanguage.googleapis.com/v1beta/models",
};

function buildHeaders(provider: ProviderId, apiKey: string): HeadersInit {
  switch (provider) {
    case "openai":
      return { Authorization: `Bearer ${apiKey}` };
    case "anthropic":
      return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    case "google":
      return { "x-goog-api-key": apiKey };
  }
}

interface ProviderErrorBody {
  error?: { message?: string };
}

export async function POST(req: Request) {
  const clientKey = getClientKey(req.headers);
  const { allowed, retryAfterSeconds } = checkRateLimit(clientKey);
  if (!allowed) {
    return Response.json(
      { valid: false, message: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: { provider?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ valid: false, message: "Invalid request." }, { status: 400 });
  }

  const { provider, apiKey } = body;
  if (!provider || !isSupportedProvider(provider) || !apiKey?.trim()) {
    return Response.json({ valid: false, message: "Invalid request." }, { status: 400 });
  }

  try {
    // Never log `apiKey` — this is the caller's own key, used only for this
    // one verification call, matching the same discipline as /api/chat.
    const res = await fetch(VALIDATION_ENDPOINTS[provider], {
      headers: buildHeaders(provider, apiKey.trim()),
    });

    if (res.ok) {
      return Response.json({ valid: true });
    }

    const errorBody = (await res.json().catch(() => null)) as ProviderErrorBody | null;
    const message = errorBody?.error?.message || "This API key was rejected.";
    return Response.json({ valid: false, message });
  } catch {
    return Response.json(
      { valid: false, message: "Couldn't reach the provider to verify this key." },
      { status: 502 }
    );
  }
}
