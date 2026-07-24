/**
 * Chunks parsed docs into ~300-800 token pieces on H2/H3 boundaries, never
 * splitting a fenced code block (blueprint §4 "Chunking"). Small adjacent
 * sections are merged forward; oversized sections are split further on
 * paragraph/code-fence-unit boundaries with a modest overlap.
 */
import { parseAllDocs, type ParsedDoc, type ParsedSection } from "./parse-docs";
import { tokenizeBlocks } from "./markdown-utils";
import { isMainModule } from "./run-guard";

export interface Chunk {
  id: string;
  sourcePath: string;
  heading: string;
  url: string;
  text: string;
}

// A rough, dependency-free token estimate (~4 chars/token for English prose
// and code). Good enough for sizing decisions here; see lib/embeddings.ts
// for the actual embedding model, which has its own (shorter) internal
// truncation limit independent of this chunk-sizing heuristic.
const CHARS_PER_TOKEN = 4;
const MIN_CHUNK_TOKENS = 120;
const MAX_CHUNK_TOKENS = 800;
const OVERLAP_TOKENS = 60;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function sectionUrl(doc: ParsedDoc, anchor: string): string {
  return anchor ? `${doc.canonicalBaseUrl}#${anchor}` : doc.canonicalBaseUrl;
}

/** Fence-aware split into atomic units: whole code fences, or prose
 * paragraphs. Used only when a single section is too large on its own and
 * must be split further without ever cutting through a code fence. */
function splitIntoUnits(content: string): string[] {
  const units: string[] = [];
  for (const block of tokenizeBlocks(content)) {
    if (block.type === "code") {
      units.push("```" + block.info + "\n" + block.content + "\n```");
    } else {
      const paragraphs = block.content
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      units.push(...paragraphs);
    }
  }
  return units;
}

function packUnitsIntoChunks(units: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const unit of units) {
    const unitTokens = estimateTokens(unit);

    if (current.length > 0 && currentTokens + unitTokens > MAX_CHUNK_TOKENS) {
      chunks.push(current.join("\n\n"));

      // Modest overlap: carry the last unit forward if it's small.
      const tail = current[current.length - 1];
      if (estimateTokens(tail) <= OVERLAP_TOKENS) {
        current = [tail];
        currentTokens = estimateTokens(tail);
      } else {
        current = [];
        currentTokens = 0;
      }
    }

    current.push(unit);
    currentTokens += unitTokens;
  }

  if (current.length > 0) chunks.push(current.join("\n\n"));
  return chunks;
}

/** Groups consecutive small sections together (up to MAX_CHUNK_TOKENS) so
 * short entries (e.g. a one-paragraph API method) don't each become a tiny,
 * low-signal chunk. A single section already at/over the max forms its own
 * group, split further downstream. */
function groupSections(sections: ParsedSection[]): ParsedSection[][] {
  const groups: ParsedSection[][] = [];
  let buffer: ParsedSection[] = [];
  let bufferTokens = 0;

  for (const section of sections) {
    const sectionTokens = estimateTokens(section.content);

    if (buffer.length > 0 && bufferTokens + sectionTokens > MAX_CHUNK_TOKENS) {
      groups.push(buffer);
      buffer = [];
      bufferTokens = 0;
    }

    buffer.push(section);
    bufferTokens += sectionTokens;

    if (bufferTokens >= MIN_CHUNK_TOKENS) {
      groups.push(buffer);
      buffer = [];
      bufferTokens = 0;
    }
  }

  if (buffer.length > 0) groups.push(buffer);
  return groups;
}

function chunkDoc(doc: ParsedDoc): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;

  for (const group of groupSections(doc.sections)) {
    const primary = group[0];
    // Use the first section's own heading, not a "A / B / C" join of every
    // merged section — the citation URL already points at just this one
    // section, so labeling it with sections it doesn't link to is misleading
    // (and reads as noise in the UI's Sources list).
    const heading = primary.heading;
    const combinedText = group.map((s) => s.content).join("\n\n");
    const url = sectionUrl(doc, primary.anchor);

    if (estimateTokens(combinedText) <= MAX_CHUNK_TOKENS) {
      chunks.push({ id: `${doc.sourcePath}::${index++}`, sourcePath: doc.sourcePath, heading, url, text: combinedText });
      continue;
    }

    // Split parts all share one URL/heading — lib/rag.ts already dedupes
    // citations by URL, so a "(part N/M)" suffix here would just leak
    // through as whichever part happened to be retrieved first.
    const parts = packUnitsIntoChunks(splitIntoUnits(combinedText));
    parts.forEach((part) => {
      chunks.push({
        id: `${doc.sourcePath}::${index++}`,
        sourcePath: doc.sourcePath,
        heading,
        url,
        text: part,
      });
    });
  }

  return chunks;
}

export function chunkDocs(docs: ParsedDoc[]): Chunk[] {
  return docs.flatMap(chunkDoc);
}

if (isMainModule(import.meta.url)) {
  parseAllDocs()
    .then((docs) => {
      const chunks = chunkDocs(docs);
      const tokenCounts = chunks.map((c) => estimateTokens(c.text));
      const avg = tokenCounts.reduce((a, b) => a + b, 0) / chunks.length;
      const max = Math.max(...tokenCounts);
      const min = Math.min(...tokenCounts);

      console.log(`Chunked ${docs.length} pages into ${chunks.length} chunks.`);
      console.log(`Token size — min: ${min}, avg: ${avg.toFixed(0)}, max: ${max}`);

      const oversized = chunks.filter((c) => estimateTokens(c.text) > MAX_CHUNK_TOKENS);
      if (oversized.length > 0) {
        console.warn(`${oversized.length} chunks exceed ${MAX_CHUNK_TOKENS} tokens (unexpected).`);
      }

      console.log("\nSample chunks from locators.md:");
      for (const chunk of chunks.filter((c) => c.sourcePath === "docs/src/locators.md").slice(0, 3)) {
        console.log(`  - [${estimateTokens(chunk.text)} tok] ${chunk.heading} -> ${chunk.url}`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
