import { useEffect, useState } from "react";
import type { ProviderId } from "@/lib/providers";

const VALIDATE_DEBOUNCE_MS = 600;

export type ValidationState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "valid" }
  // The provider itself rejected this key — a definitive verdict, safe to
  // block saving on.
  | { status: "invalid" }
  // We couldn't get a verdict either way (our rate limit, a network blip,
  // the provider being unreachable) — NOT a statement about the key, so
  // callers should let the user save anyway rather than block them on an
  // unrelated hiccup.
  | { status: "unverified" };

/** Debounced live key validation against /api/validate-key. Every setState
 * call happens inside a fetch callback, never synchronously in the effect
 * body — "checking" isn't stored state, it's derived by comparing the last
 * completed result's key against the current one, so a still-in-flight (or
 * not-yet-started) check reads as "checking" for free.
 *
 * Shared by api-key-modal.tsx (the "change key" popup) and connect-panel.tsx
 * (the first-time inline landing form) — same validation behavior, two
 * different visual presentations. */
export function useKeyValidation(provider: ProviderId, apiKey: string): ValidationState {
  const trimmed = apiKey.trim();
  const requestKey = `${provider}:${trimmed}`;
  const [result, setResult] = useState<{ requestKey: string; state: ValidationState } | null>(
    null
  );

  useEffect(() => {
    if (!trimmed) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: trimmed }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = (await res.json()) as { valid: boolean };
          // res.ok means our route completed its check and is reporting
          // the provider's real verdict. A non-2xx (429 rate-limited, 502
          // unreachable, etc.) means we never actually heard back from the
          // provider — that's on us/the network, not the key.
          const state: ValidationState = res.ok
            ? { status: data.valid ? "valid" : "invalid" }
            : { status: "unverified" };
          setResult({ requestKey, state });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResult({ requestKey, state: { status: "unverified" } });
        });
    }, VALIDATE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [provider, trimmed, requestKey]);

  if (!trimmed) return { status: "idle" };
  if (!result || result.requestKey !== requestKey) return { status: "checking" };
  return result.state;
}
