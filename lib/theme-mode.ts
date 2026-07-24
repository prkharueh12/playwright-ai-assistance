export type ThemeChoice = "day" | "night" | "system";
export type ResolvedScene = "day" | "night";

const STORAGE_KEY = "playwright-assistant:theme-mode";

function parseChoice(raw: string | null): ThemeChoice {
  if (raw === "day" || raw === "night" || raw === "system") return raw;
  return "system";
}

// Same cached-snapshot pattern as lib/credentials.ts, so getSnapshot()
// returns a stable reference for useSyncExternalStore unless storage
// actually changed.
let cachedRaw: string | null = null;
let cachedChoice: ThemeChoice = "system";

const choiceListeners = new Set<() => void>();

function notifyChoice() {
  choiceListeners.forEach((listener) => listener());
}

export function subscribeThemeChoice(callback: () => void): () => void {
  choiceListeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    choiceListeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

export function getThemeChoiceSnapshot(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedChoice = parseChoice(raw);
  }
  return cachedChoice;
}

export function getServerThemeChoiceSnapshot(): ThemeChoice {
  return "system";
}

export function saveThemeChoice(choice: ThemeChoice): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, choice);
  cachedRaw = choice;
  cachedChoice = choice;
  notifyChoice();
}

function computeSystemScene(): ResolvedScene {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 19 ? "day" : "night";
}

export function resolveScene(choice: ThemeChoice): ResolvedScene {
  return choice === "system" ? computeSystemScene() : choice;
}

// A "system" choice needs to tick over at the day/night boundary on its
// own. Rather than a synchronous setState in a useEffect body, the timer
// lives entirely inside subscribe() — the standard useSyncExternalStore
// shape for an external, time-based source — so useResolvedScene below
// stays consistent with this codebase's existing lint-clean patterns
// (see the "checking" derivation in api-key-modal.tsx).
const sceneListeners = new Set<() => void>();
let sceneTimer: ReturnType<typeof setInterval> | null = null;

export function subscribeResolvedScene(callback: () => void): () => void {
  sceneListeners.add(callback);
  if (typeof window !== "undefined" && sceneTimer === null) {
    sceneTimer = setInterval(() => {
      sceneListeners.forEach((listener) => listener());
    }, 60_000);
  }
  return () => {
    sceneListeners.delete(callback);
    if (sceneListeners.size === 0 && sceneTimer !== null) {
      clearInterval(sceneTimer);
      sceneTimer = null;
    }
  };
}
