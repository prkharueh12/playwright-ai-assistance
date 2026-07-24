import { pipeline } from "@xenova/transformers";

/**
 * Local embedding model — used both at ingestion time (scripts/embed-docs.ts)
 * and at query time (lib/retrieval.ts, Phase 4), so retrieval never depends
 * on which LLM provider key the caller brings. Runs fully offline/on-device.
 */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

type Extractor = Awaited<ReturnType<typeof pipeline<"feature-extraction">>>;

let extractorPromise: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return extractorPromise;
}

/** Embeds a single piece of text into a normalized, mean-pooled vector. */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}
