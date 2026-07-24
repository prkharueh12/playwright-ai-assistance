import type { ProviderId } from "@/lib/providers";

export interface StoredCredentials {
  provider: ProviderId;
  apiKey: string;
}

const STORAGE_KEY = "playwright-assistant:credentials";

function parse(raw: string | null): StoredCredentials | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (!parsed.provider || !parsed.apiKey) return null;
    return { provider: parsed.provider, apiKey: parsed.apiKey };
  } catch {
    return null;
  }
}

// Cache so getSnapshot() returns a stable reference (required by
// useSyncExternalStore) unless the underlying storage actually changed.
let cachedRaw: string | null = null;
let cachedValue: StoredCredentials | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/**
 * Client-only storage for the user's BYOK credentials. Per blueprint §3,
 * these live in localStorage ONLY — never sent anywhere except as per-request
 * headers to /api/chat, and never persisted server-side.
 */
export function subscribeCredentials(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

export function getCredentialsSnapshot(): StoredCredentials | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

export function getServerCredentialsSnapshot(): StoredCredentials | null {
  return null;
}

export function saveCredentials(credentials: StoredCredentials): void {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(credentials);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedValue = credentials;
  notify();
}

export function clearCredentials(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  cachedRaw = null;
  cachedValue = null;
  notify();
}
