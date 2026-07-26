"use client";

import { useRef, useState } from "react";
import { CircleCheck, CircleX, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";
import { PROVIDER_LABELS, SUPPORTED_PROVIDERS, type ProviderId } from "@/lib/providers";
import { useKeyValidation } from "@/lib/use-key-validation";
import type { StoredCredentials } from "@/lib/credentials";

const API_KEY_PLACEHOLDERS: Record<ProviderId, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  google: "AIza...",
};

interface ConnectPanelProps {
  onConnect: (credentials: StoredCredentials) => void;
}

/** First-time landing form: same glass treatment as the chat panel, shown
 * in its place until a key is saved. Reuses the same validation hook and
 * save semantics as api-key-modal.tsx's "change key" popup — Connect only
 * blocks on a definitive provider rejection ("invalid"); a validation
 * check that itself failed to complete ("unverified" — our rate limit, a
 * network blip) isn't a statement about the key, so it stays saveable. */
export function ConnectPanel({ onConnect }: ConnectPanelProps) {
  const [provider, setProvider] = useState<ProviderId>(SUPPORTED_PROVIDERS[0]);
  // Keyed by provider, same as api-key-modal.tsx's "change key" form —
  // switching providers shows that provider's own last-typed key (blank if
  // none yet) rather than carrying over or losing what was typed for
  // another one. In-memory only; nothing here is persisted until Connect.
  const [keysByProvider, setKeysByProvider] = useState<Partial<Record<ProviderId, string>>>({});
  const apiKey = keysByProvider[provider] ?? "";
  function setApiKey(value: string) {
    setKeysByProvider((prev) => ({ ...prev, [provider]: value }));
  }
  const validation = useKeyValidation(provider, apiKey);
  const inputRef = useRef<HTMLInputElement>(null);
  // Re-masks on every provider switch rather than persisting per-provider —
  // a revealed key shouldn't stay visible once you've moved on from it.
  const [showKey, setShowKey] = useState(false);

  function handleProviderChange(id: ProviderId) {
    setProvider(id);
    setShowKey(false);
  }

  function handleConnect() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    onConnect({ provider, apiKey: trimmed });
  }

  function handleClearInvalidKey() {
    setApiKey("");
    inputRef.current?.focus();
  }

  return (
    <main className="chat-panel connect-panel">
      <div className="chat-head">
        <div>
          <h1>Connect your AI model</h1>
          <p>
            Power Korso Agent with your own API key. Your credentials stay on
            your device and are only sent to your selected provider.
          </p>
        </div>
      </div>

      <div className="connect-body">
        <div className="connect-providers" role="group" aria-label="Provider">
          {SUPPORTED_PROVIDERS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={provider === id}
              onClick={() => handleProviderChange(id)}
            >
              {PROVIDER_LABELS[id]}
            </button>
          ))}
        </div>

        <div className="connect-key-row">
          <input
            ref={inputRef}
            type={showKey ? "text" : "password"}
            autoComplete="off"
            placeholder={API_KEY_PLACEHOLDERS[provider]}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleConnect();
            }}
            aria-invalid={validation.status === "invalid"}
          />
          <div className="connect-key-icons">
            <span className="connect-key-status">
              {validation.status === "checking" && <Loader2 className="checking animate-spin" />}
              {validation.status === "valid" && <CircleCheck className="valid" />}
              {validation.status === "invalid" && (
                <button
                  type="button"
                  className="invalid"
                  onClick={handleClearInvalidKey}
                  aria-label="Clear invalid API key"
                >
                  <CircleX />
                </button>
              )}
              {validation.status === "unverified" && <TriangleAlert className="unverified" />}
            </span>
            {apiKey.length > 0 && (
              <button
                type="button"
                className="key-toggle-visibility"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                aria-pressed={showKey}
              >
                {showKey ? <EyeOff /> : <Eye />}
              </button>
            )}
          </div>
        </div>
        {validation.status === "invalid" && (
          <p className="connect-error">Invalid api key!</p>
        )}
        {validation.status === "unverified" && (
          <p className="connect-warning">Couldn&apos;t verify right now — you can still connect.</p>
        )}

        <button
          type="button"
          className="connect-submit"
          disabled={
            !apiKey.trim() ||
            validation.status === "invalid" ||
            validation.status === "checking"
          }
          onClick={handleConnect}
        >
          Connect Provider
        </button>
      </div>
    </main>
  );
}
