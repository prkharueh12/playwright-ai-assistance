/**
 * Full ingestion pipeline entry point: fetch -> parse -> chunk -> embed,
 * writing the final searchable index to data/embeddings/index.json
 * (blueprint §4 "Embed" + "Store"). Run via `npm run ingest`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchDocs } from "./fetch-docs";
import { parseAllDocs } from "./parse-docs";
import { chunkDocs, type Chunk } from "./chunk-docs";
import { embedText, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "@/lib/embeddings";
import { isMainModule } from "./run-guard";
import { readManifest } from "./raw-docs-store";

const EMBEDDINGS_DIR = path.join(process.cwd(), "data", "embeddings");
const OUTPUT_PATH = path.join(EMBEDDINGS_DIR, "index.json");

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export interface EmbeddingsIndex {
  model: string;
  dimensions: number;
  generatedAt: string;
  sourceCommitSha: string;
  chunkCount: number;
  chunks: EmbeddedChunk[];
}

async function embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
  const embedded: EmbeddedChunk[] = [];
  const total = chunks.length;

  for (let i = 0; i < total; i++) {
    const chunk = chunks[i];
    const embedding = await embedText(chunk.text);
    embedded.push({ ...chunk, embedding });

    if ((i + 1) % 100 === 0 || i === total - 1) {
      console.log(`Embedded ${i + 1}/${total} chunks`);
    }
  }

  return embedded;
}

async function ensureRawDocsFetched(): Promise<void> {
  try {
    await readManifest();
  } catch {
    console.log("No raw docs found — fetching first...");
    await fetchDocs();
  }
}

export async function buildEmbeddingsIndex(): Promise<void> {
  await ensureRawDocsFetched();
  const manifest = await readManifest();

  console.log("Parsing docs...");
  const parsedDocs = await parseAllDocs();

  console.log("Chunking docs...");
  const chunks = chunkDocs(parsedDocs);
  console.log(`${chunks.length} chunks to embed.`);

  console.log(`Loading embedding model (${EMBEDDING_MODEL})...`);
  const embeddedChunks = await embedChunks(chunks);

  const index: EmbeddingsIndex = {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    generatedAt: new Date().toISOString(),
    sourceCommitSha: manifest.commitSha,
    chunkCount: embeddedChunks.length,
    chunks: embeddedChunks,
  };

  await mkdir(EMBEDDINGS_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(index), "utf8");
  console.log(`Wrote ${embeddedChunks.length} embedded chunks to ${OUTPUT_PATH}`);
}

if (isMainModule(import.meta.url)) {
  buildEmbeddingsIndex().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
