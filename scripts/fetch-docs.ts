/**
 * Fetches the Playwright docs corpus (docs/src/**) from microsoft/playwright
 * on GitHub — raw source .md files only, never rendered HTML (blueprint §4/§11).
 *
 * Selection rules:
 *  - Flat pages at docs/src/*.md: keep the JS/TS variant of multi-language
 *    pages (files suffixed -js.md, or combined suffixes containing "js"),
 *    and keep language-agnostic pages (no recognized language suffix at
 *    all, e.g. locators.md). Drop pure non-JS variants (-java.md, etc).
 *  - Everything under docs/src/api/ and docs/src/test-api/ (the JS API
 *    reference — these map to the same /docs/api/<slug> URLs on the live
 *    site) is kept in full.
 *  - Everything else (images/, electron-api/, mobile-api/, non-JS guides)
 *    is out of scope for this MVP corpus.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMainModule } from "./run-guard";

const REPO = "microsoft/playwright";
const REF = "main";
const DOCS_ROOT = "docs/src/";
const RAW_DOCS_DIR = path.join(process.cwd(), "data", "raw-docs");
const CONCURRENCY = 8;

const LANGUAGE_SUFFIXES = ["js", "java", "python", "csharp", "dotnet"];

interface GitTreeEntry {
  path: string;
  type: "blob" | "tree";
}

interface GitTreeResponse {
  sha: string;
  truncated: boolean;
  tree: GitTreeEntry[];
}

// Not a class reference page — this is Playwright's own template-macro
// dictionary (entries like "## input-timeout" resolved into "%%-input-timeout-%%"
// placeholders elsewhere). It 404s on the live site, so it can't be cited,
// and its "## heading" shape doesn't match any class/member pattern anyway.
const EXCLUDED_PATHS = new Set(["docs/src/api/params.md"]);

function isApiReferencePath(filePath: string): boolean {
  if (EXCLUDED_PATHS.has(filePath)) return false;
  return filePath.startsWith("docs/src/api/") || filePath.startsWith("docs/src/test-api/");
}

function isKeptFlatGuide(filePath: string): boolean {
  const rest = filePath.slice(DOCS_ROOT.length);
  if (rest.includes("/")) return false; // only top-level flat files here
  if (!rest.endsWith(".md")) return false;

  const base = rest.slice(0, -".md".length);
  const parts = base.split("-");

  let cut = parts.length;
  while (cut > 0 && LANGUAGE_SUFFIXES.includes(parts[cut - 1])) cut--;
  const suffixes = parts.slice(cut);

  if (suffixes.length === 0) return true; // language-agnostic page — keep
  return suffixes.includes("js");
}

function shouldKeep(filePath: string): boolean {
  if (!filePath.startsWith(DOCS_ROOT) || !filePath.endsWith(".md")) return false;
  if (isApiReferencePath(filePath)) return true;
  return isKeptFlatGuide(filePath);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "playwright-docs-assistant" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}

async function fetchRaw(commitSha: string, filePath: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${REPO}/${commitSha}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch raw file (${res.status}): ${filePath}`);
  }
  return res.text();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function fetchDocs(): Promise<{ commitSha: string; files: string[] }> {
  console.log(`Resolving latest commit for ${REPO}@${REF}...`);
  const commit = await fetchJson<{ sha: string }>(
    `https://api.github.com/repos/${REPO}/commits/${REF}`
  );
  const commitSha = commit.sha;
  console.log(`Pinned to commit ${commitSha}`);

  console.log("Fetching docs/src tree...");
  const tree = await fetchJson<GitTreeResponse>(
    `https://api.github.com/repos/${REPO}/git/trees/${commitSha}?recursive=1`
  );
  if (tree.truncated) {
    throw new Error("GitHub tree API response was truncated — corpus is larger than expected.");
  }

  const filesToFetch = tree.tree
    .filter((entry) => entry.type === "blob" && shouldKeep(entry.path))
    .map((entry) => entry.path)
    .sort();

  console.log(`Selected ${filesToFetch.length} files. Downloading (concurrency ${CONCURRENCY})...`);

  await mapWithConcurrency(filesToFetch, CONCURRENCY, async (filePath) => {
    const content = await fetchRaw(commitSha, filePath);
    const destPath = path.join(RAW_DOCS_DIR, filePath);
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, content, "utf8");
  });

  const manifest = {
    repo: REPO,
    ref: REF,
    commitSha,
    fetchedAt: new Date().toISOString(),
    files: filesToFetch,
  };
  await mkdir(RAW_DOCS_DIR, { recursive: true });
  await writeFile(
    path.join(RAW_DOCS_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  console.log(`Done. Wrote ${filesToFetch.length} files to ${RAW_DOCS_DIR}`);
  return { commitSha, files: filesToFetch };
}

if (isMainModule(import.meta.url)) {
  fetchDocs().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
