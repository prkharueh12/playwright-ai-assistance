import { readFileSync } from "node:fs";

export interface PromptfooResultEntry {
  description?: string;
  success: boolean;
}

export interface PromptfooReport {
  results: {
    results: PromptfooResultEntry[];
    stats?: {
      successes?: number;
      failures?: number;
      errors?: number;
      durationMs?: number;
    };
  };
}

export interface ParsedSummary {
  total: number;
  passed: number;
  failed: number;
  failedDescriptions: string[];
  durationMs?: number;
}

export function readReport(path: string): PromptfooReport | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function summarize(report: PromptfooReport): ParsedSummary {
  const entries = report.results?.results ?? [];
  const stats = report.results?.stats;
  // Prefer promptfoo's own computed counts (matches its CLI output
  // exactly, and distinguishes assertion failures from execution errors);
  // fall back to deriving from the results array if stats is missing.
  const passed = stats?.successes ?? entries.filter((entry) => entry.success).length;
  const failed = stats ? (stats.failures ?? 0) + (stats.errors ?? 0) : entries.length - passed;
  const total = passed + failed;
  const failedDescriptions = entries
    .filter((entry) => !entry.success)
    .map((entry) => entry.description ?? "Untitled test case");

  return {
    total,
    passed,
    failed,
    failedDescriptions,
    durationMs: stats?.durationMs,
  };
}

export function formatDuration(ms?: number): string {
  if (ms === undefined) return "n/a";
  return `${(ms / 1000).toFixed(1)}s`;
}
