/**
 * Parses fetched raw docs (data/raw-docs/**) into a normalized structure:
 * one or more heading-delimited sections per page, cleaned of frontmatter,
 * Playwright's doc-generator directives/macros, and non-JS code variants
 * (blueprint §4 "Parse & clean").
 *
 * The corpus has two distinct source shapes that need different heading
 * handling (verified against the live site's rendered anchors — see the
 * canonical-URL comments below):
 *  - "Guide" pages (flat docs/src/*.md): YAML frontmatter for id/title,
 *    natural-language "## " / "### " headings, GitHub-slug anchors.
 *  - "API reference" pages (docs/src/api/**, docs/src/test-api/**): no
 *    frontmatter, start with "# class: X", and each member is its own
 *    "## [async ]method: X.y" / "## property: X.y" / "## event: X.y"
 *    heading. Playwright's own doc generator renders these as H3s per
 *    member with anchor `${kebab(class)}-${kebab(member)}` — camelCase
 *    segments become kebab-case (e.g. BrowserContext.routeFromHAR ->
 *    browser-context-route-from-har). Both api/ and test-api/ publish to
 *    the same /docs/api/<page> URL space on the live site.
 */
import path from "node:path";
import {
  applyLanguageFilter,
  camelToKebab,
  cleanProseText,
  githubSlug,
  isJsOrLanguageAgnostic,
  tokenizeBlocks,
  type Block,
} from "./markdown-utils";
import { isMainModule } from "./run-guard";
import { readManifest, readRawDoc } from "./raw-docs-store";

export interface ParsedSection {
  heading: string;
  anchor: string;
  content: string;
}

export interface ParsedDoc {
  sourcePath: string;
  pageSlug: string;
  pageTitle: string;
  canonicalBaseUrl: string;
  sections: ParsedSection[];
}

const FENCE_RE = /^```(\S.*)?$/;

function blockToString(block: Block): string {
  if (block.type === "text") return cleanProseText(block.content);
  return "```" + block.info + "\n" + block.content + "\n```";
}

/** Strips frontmatter/non-JS code fences and reassembles cleaned markdown. */
function cleanMarkdown(markdown: string): string {
  const reassembled = tokenizeBlocks(markdown)
    .filter((block) => block.type === "text" || isJsOrLanguageAgnostic(block.info))
    .map(blockToString)
    .join("\n");

  // Collapse blank-line runs left behind by dropped (non-JS) code blocks —
  // cleanProseText only collapses runs within a single block, not across
  // the gap left by an entire block being removed at reassembly time.
  return reassembled.replace(/\n{3,}/g, "\n\n");
}

interface RawSection {
  headingText: string;
  content: string;
}

/** Fence-aware split on H2/H3 boundaries. Returns any pre-heading content
 * as a section keyed by `preambleHeading` (only if it has real content). */
function splitOnHeadings(
  markdown: string,
  headingRe: RegExp,
  preambleHeading: string
): RawSection[] {
  const lines = markdown.split("\n");
  const sections: RawSection[] = [];
  let current: RawSection | null = null;
  const preambleLines: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (FENCE_RE.test(line)) inFence = !inFence;

    if (!inFence) {
      const match = headingRe.exec(line);
      if (match) {
        if (current) sections.push(current);
        current = { headingText: match[1].trim(), content: "" };
        continue;
      }
    }

    if (current) current.content += line + "\n";
    else preambleLines.push(line);
  }
  if (current) sections.push(current);

  const preamble = preambleLines.join("\n").trim();
  if (preamble) {
    sections.unshift({ headingText: preambleHeading, content: preamble });
  }

  return sections;
}

function parseFrontmatter(raw: string): { id?: string; title?: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!match) return { body: raw };

  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const fieldMatch = /^(\w+):\s*(.*)$/.exec(line);
    if (fieldMatch) {
      fields[fieldMatch[1]] = fieldMatch[2].trim().replace(/^"(.*)"$/, "$1");
    }
  }

  return { id: fields.id, title: fields.title, body: raw.slice(match[0].length) };
}

function parseGuidePage(sourcePath: string, raw: string): ParsedDoc {
  const { id, title, body } = parseFrontmatter(raw);
  const fileBase = path.basename(sourcePath, ".md");
  const pageSlug = id ?? fileBase.replace(/-js$/, "");
  const pageTitle = title ?? pageSlug;

  const cleaned = cleanMarkdown(body);
  const rawSections = splitOnHeadings(cleaned, /^#{2,3}\s+(.*)$/, pageTitle);

  const sections: ParsedSection[] = rawSections
    .map(({ headingText, content }): ParsedSection | null => {
      const filtered = applyLanguageFilter(content);
      if (filtered === null) return null; // section doesn't apply to JS
      return {
        heading: headingText,
        anchor: headingText === pageTitle && !content.startsWith("#") ? "" : githubSlug(headingText),
        content: filtered.trim(),
      };
    })
    .filter((section): section is ParsedSection => section !== null && section.content.length > 0);

  return {
    sourcePath,
    pageSlug,
    pageTitle,
    canonicalBaseUrl: `https://playwright.dev/docs/${pageSlug}`,
    sections,
  };
}

function parseApiReferencePage(sourcePath: string, raw: string): ParsedDoc {
  const classMatch = /^#\s*class:\s*(\S+)/.exec(raw);
  const className = classMatch?.[1] ?? path.basename(sourcePath, ".md").replace(/^class-/, "");
  const bodyAfterH1 = classMatch ? raw.slice(classMatch.index + classMatch[0].length) : raw;

  const pageSlug = path.basename(sourcePath, ".md"); // e.g. "class-locator"
  const cleaned = cleanMarkdown(bodyAfterH1);

  // splitOnHeadings takes a single-capture regex; capture "kind:
  // Class.member[.sub][#N]" as one group (dropping any trailing template-
  // macro default, e.g. "= %%-response-security-details-%%") and re-split
  // it below. Segment charset includes "()" for the one-off "Test.(call)".
  const memberHeadingRe =
    /^##\s*(?:async\s+)?((?:method|property|event):\s*[A-Za-z0-9_$()]+(?:\.[A-Za-z0-9_$()]+)+(?:#\d+)?)(?:\s*=\s*%%-\S+-%%)?\s*$/;
  const rawSections = splitOnHeadings(cleaned, memberHeadingRe, className);

  const sections: ParsedSection[] = rawSections
    .map(({ headingText, content }): ParsedSection | null => {
      if (headingText === className) {
        return { heading: className, anchor: "", content: content.trim() };
      }

      const filtered = applyLanguageFilter(content);
      if (filtered === null) return null; // member doesn't exist in JS

      const [, kind, rawIdentifier] = /^(method|property|event):\s*(.+)$/.exec(headingText)!;

      // Split off an explicit overload suffix ("...toHaveAttribute#2"),
      // which Playwright's own anchors render as a trailing "-2".
      const overloadMatch = /^(.+)#(\d+)$/.exec(rawIdentifier);
      const identifier = overloadMatch ? overloadMatch[1] : rawIdentifier;
      const overloadSuffix = overloadMatch ? `-${overloadMatch[2]}` : "";

      // Events get an extra "-event-" segment after the class name, distinct
      // from a same-named method/property on the same class (e.g. the
      // `close` event vs. the `close()` method both exist on BrowserContext:
      // "browser-context-event-close" vs. "browser-context-close" —
      // verified against the live site's rendered anchors).
      const [classSegment, ...memberSegments] = identifier.split(".");
      const anchorSegments = kind === "event"
        ? [classSegment, "event", ...memberSegments]
        : [classSegment, ...memberSegments];

      return {
        heading: identifier,
        anchor: anchorSegments.map(camelToKebab).join("-") + overloadSuffix,
        content: filtered.trim(),
      };
    })
    .filter((section): section is ParsedSection => section !== null && section.content.length > 0);

  return {
    sourcePath,
    pageSlug,
    pageTitle: className,
    canonicalBaseUrl: `https://playwright.dev/docs/api/${pageSlug}`,
    sections,
  };
}

function isApiReferencePath(sourcePath: string): boolean {
  return sourcePath.startsWith("docs/src/api/") || sourcePath.startsWith("docs/src/test-api/");
}

export async function parseAllDocs(): Promise<ParsedDoc[]> {
  const manifest = await readManifest();
  const docs: ParsedDoc[] = [];

  for (const sourcePath of manifest.files) {
    const raw = await readRawDoc(sourcePath);
    const doc = isApiReferencePath(sourcePath)
      ? parseApiReferencePage(sourcePath, raw)
      : parseGuidePage(sourcePath, raw);
    docs.push(doc);
  }

  return docs;
}

if (isMainModule(import.meta.url)) {
  parseAllDocs()
    .then((docs) => {
      const totalSections = docs.reduce((sum, d) => sum + d.sections.length, 0);
      console.log(`Parsed ${docs.length} pages, ${totalSections} sections total.`);
      const sample = docs.find((d) => d.sourcePath === "docs/src/locators.md");
      if (sample) {
        console.log("\nSample (locators.md):");
        console.log(`  canonicalBaseUrl: ${sample.canonicalBaseUrl}`);
        for (const section of sample.sections.slice(0, 3)) {
          console.log(`  - ${section.heading} (#${section.anchor}) [${section.content.length} chars]`);
        }
      }
      const apiSample = docs.find((d) => d.sourcePath === "docs/src/api/class-locator.md");
      if (apiSample) {
        console.log("\nSample (api/class-locator.md):");
        console.log(`  canonicalBaseUrl: ${apiSample.canonicalBaseUrl}`);
        for (const section of apiSample.sections.slice(0, 5)) {
          console.log(`  - ${section.heading} (#${section.anchor}) [${section.content.length} chars]`);
        }
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
