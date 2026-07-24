import { readFile } from "node:fs/promises";
import path from "node:path";
import { embedText } from "@/lib/embeddings";

export interface IndexedChunk {
  id: string;
  sourcePath: string;
  heading: string;
  url: string;
  text: string;
  embedding: number[];
}

interface EmbeddingsIndexFile {
  model: string;
  dimensions: number;
  chunks: IndexedChunk[];
}

const INDEX_PATH = path.join(process.cwd(), "data", "embeddings", "index.json");
const DEFAULT_TOP_K = 6;

// Loaded once per warm server instance and reused across requests — the
// blueprint's "prebuilt local index file ... loaded into memory by the API
// route on cold start" (§5).
let indexPromise: Promise<IndexedChunk[]> | null = null;

async function loadIndex(): Promise<IndexedChunk[]> {
  if (!indexPromise) {
    indexPromise = readFile(INDEX_PATH, "utf8")
      .then((raw) => (JSON.parse(raw) as EmbeddingsIndexFile).chunks)
      .catch((error: NodeJS.ErrnoException) => {
        indexPromise = null; // allow retry on a later request instead of caching the failure
        if (error.code === "ENOENT") {
          throw new Error(
            `Embeddings index not found at ${INDEX_PATH}. Run "npm run ingest" first.`
          );
        }
        throw error;
      });
  }
  return indexPromise;
}

// Embeddings are unit-normalized at embed time (lib/embeddings.ts), so a
// plain dot product is equivalent to cosine similarity here.
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export interface RetrievedChunk extends IndexedChunk {
  score: number;
}

/** Embeds the query with the same local model used at ingestion time, then
 * returns the top-k most similar chunks by cosine similarity (blueprint §5). */
export async function retrieveRelevantChunks(
  query: string,
  topK: number = DEFAULT_TOP_K
): Promise<RetrievedChunk[]> {
  const [chunks, queryEmbedding] = await Promise.all([loadIndex(), embedText(query)]);

  return chunks
    .map((chunk) => ({ ...chunk, score: dotProduct(chunk.embedding, queryEmbedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
