import { readFile } from "node:fs/promises";
import path from "node:path";

const RAW_DOCS_DIR = path.join(process.cwd(), "data", "raw-docs");

export interface RawDocsManifest {
  repo: string;
  ref: string;
  commitSha: string;
  fetchedAt: string;
  files: string[];
}

export async function readManifest(): Promise<RawDocsManifest> {
  const manifestPath = path.join(RAW_DOCS_DIR, "manifest.json");
  try {
    const raw = await readFile(manifestPath, "utf8");
    return JSON.parse(raw) as RawDocsManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No manifest found at ${manifestPath}. Run "npm run ingest:fetch" first.`
      );
    }
    throw error;
  }
}

export async function readRawDoc(sourcePath: string): Promise<string> {
  return readFile(path.join(RAW_DOCS_DIR, sourcePath), "utf8");
}
