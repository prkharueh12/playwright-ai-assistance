/**
 * Fence-aware markdown tokenizing/cleaning helpers shared by parse-docs.ts
 * and chunk-docs.ts. Kept out of lib/ since none of this runs at request
 * time — it's ingestion-only.
 */

export interface CodeBlock {
  type: "code";
  info: string;
  content: string; // raw lines between the fences, without the fence markers
}

export interface TextBlock {
  type: "text";
  content: string;
}

export type Block = CodeBlock | TextBlock;

const FENCE_RE = /^```(\S.*)?$/;

/** Splits markdown into an ordered list of fenced-code vs. prose blocks. */
export function tokenizeBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const fenceMatch = FENCE_RE.exec(lines[i]);
    if (fenceMatch) {
      const info = (fenceMatch[1] ?? "").trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "```") {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", info, content: codeLines.join("\n") });
    } else {
      const textLines: string[] = [];
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        textLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "text", content: textLines.join("\n") });
    }
  }

  return blocks;
}

const NON_JS_LANGS = new Set(["java", "python", "csharp", "dotnet"]);

/** Keeps only JS/TS code fences plus language-agnostic ones (html, bash,
 * json, yaml, plain...); drops Java/Python/C# variants of the same example. */
export function isJsOrLanguageAgnostic(fenceInfo: string): boolean {
  const lang = fenceInfo.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return !NON_JS_LANGS.has(lang);
}

/** Strips Playwright doc-generator directives and macro syntax from prose
 * text, without touching code fence content (callers only pass text blocks). */
export function cleanProseText(text: string): string {
  let out = text;

  // Admonition fences: ':::note', ':::warning[Title]', bare ':::' closers —
  // strip the marker lines but keep the content between them.
  out = out.replace(/^:::.*$/gm, "");

  // MDX wrapper components (<Tabs ...>...</Tabs>, <TabItem ...>...</TabItem>)
  // — strip the wrapper tags, keep their inner content.
  out = out.replace(/<Tabs\b[\s\S]*?>/g, "");
  out = out.replace(/<\/Tabs>/g, "");
  out = out.replace(/<TabItem\b[^>]*>/g, "");
  out = out.replace(/<\/TabItem>/g, "");
  // Generic fallback for any other capitalized custom component tag.
  out = out.replace(/<\/?[A-Z][A-Za-z]*(?:\s[^>]*)?\/?>/g, "");

  // Playwright reference-link macros: [`method: X`] / [`property: X`] /
  // [`event: X`] / [`option: X`] -> `X`
  out = out.replace(/\[`(?:method|property|event|option):\s*([^`]+)`\]/g, "`$1`");

  // Bracketed type references: <[Array]<[Locator]>> -> <Array<Locator>>
  out = out.replace(/\[([A-Za-z][\w.]*)\]/g, "$1");

  // Remaining bare reference brackets not already handled above and not a
  // real markdown link (which is always followed by "(url)").
  out = out.replace(/\[([A-Za-z][\w.]*)\](?!\()/g, "$1");

  // API-reference metadata cruft.
  out = out.replace(/^\* since:.*$/gm, "");
  out = out.replace(/^- returns: (.+)$/gm, "Returns: $1");
  // "### option: X.y.z = %%-macro-%%" / "### param: ..." — per-parameter
  // sub-headings whose description is an unresolved template macro (defined
  // in docs/src/api/params.md, which this pipeline doesn't fetch/resolve).
  // Drop the whole line rather than leak the raw "%%-...-%%" placeholder.
  out = out.replace(/^#{2,4}\s*(?:option|param):.*$/gm, "");

  // Collapse the blank-line runs left behind by the stripped lines above.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out;
}

/**
 * "* langs: java, python, csharp" marks an entire section as not existing in
 * the listed language variant(s) — distinct from the file-level "-js.md"
 * suffix, this is a per-section marker seen in both API-reference and guide
 * pages. Returns null when JS isn't listed (section should be dropped
 * entirely), otherwise the content with the marker line removed.
 */
export function applyLanguageFilter(content: string): string | null {
  const match = /^\* langs:\s*(.+)$/m.exec(content);
  if (match) {
    const langs = match[1].split(",").map((lang) => lang.trim().toLowerCase());
    if (!langs.includes("js")) return null;
  }
  return content.replace(/^\* langs:.*$/gm, "");
}

/** GitHub/Docusaurus-style heading slug for the flat guide pages. */
export function githubSlug(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Playwright's own anchor scheme for api/test-api pages: camelCase class
 * and member names become kebab-case, joined with a hyphen, e.g.
 * ("BrowserContext", "routeFromHAR") -> "browser-context-route-from-har".
 * Acronym runs split before the trailing capitalized word, not letter-by-
 * letter, e.g. "APIResponse" -> "api-response", "CDPSession" -> "cdp-session"
 * (verified against the live site's rendered anchors). Non-alphanumeric
 * characters (e.g. the literal "(call)" member name used for Test's call
 * signature) are stripped. */
export function camelToKebab(identifier: string): string {
  return identifier
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}
