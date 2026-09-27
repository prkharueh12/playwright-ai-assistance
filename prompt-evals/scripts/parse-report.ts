import { readFileSync } from "node:fs";

export interface PromptfooResultEntry {
  description?: string;
  success: boolean;
}

export interface PromptfooReport {
  config?: {
    description?: string;
  };
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
  description?: string;
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
    description: report.config?.description,
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

export interface SuiteSummary extends ParsedSummary {
  label: string;
  resultsPath: string;
  crashed: boolean;
}

// Config descriptions in this repo follow "Short label — fuller explanation"
// (e.g. "Off-topic refusal — queries below the retrieval relevance gate...").
// Splitting on the em dash gives a short, table-friendly label without a
// separate field to keep in sync with the config file's own description.
export function shortLabel(description: string | undefined, fallback: string): string {
  if (!description) return fallback;
  const [first] = description.split(" — ");
  return first.trim() || fallback;
}

// One suite's summary per results file — a crashed suite (no report
// produced) is its own row rather than aborting the whole combined report,
// so one bad suite doesn't hide the others' real results.
export function summarizeAll(resultsPaths: string[]): SuiteSummary[] {
  return resultsPaths.map((resultsPath) => {
    const report = readReport(resultsPath);
    if (!report) {
      return {
        label: shortLabel(undefined, resultsPath),
        resultsPath,
        crashed: true,
        total: 0,
        passed: 0,
        failed: 0,
        failedDescriptions: [],
      };
    }
    const summary = summarize(report);
    return {
      ...summary,
      label: shortLabel(summary.description, resultsPath),
      resultsPath,
      crashed: false,
    };
  });
}
