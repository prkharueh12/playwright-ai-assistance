/** Context-aware "thinking" status text, chosen from simple keyword
 * matching on the user's latest message — mirrors the categories in the
 * design doc (documentation / code generation / debugging / locators /
 * configuration), falling back to the general docs-search message. Only
 * ever shown while genuinely waiting on the model, so it always reflects
 * real (if approximate) work rather than decorative busywork text.
 *
 * Keyword lists lean broad on purpose: narrow, literal terms (just
 * "locator", "config") rarely appear in how people actually phrase
 * questions, which left the fallback dominating almost every real
 * conversation. */
const KEYWORD_STATUSES: { keywords: string[]; status: string }[] = [
  {
    keywords: [
      "error", "fail", "failing", "failed", "debug", "flaky", "flakiness",
      "crash", "crashing", "broken", "not working", "doesn't work",
      "timing out", "timed out", "stuck", "hang", "hanging",
    ],
    status: "Analyzing test failure…",
  },
  {
    keywords: [
      "locator", "selector", "getbyrole", "getbytext", "getbylabel", "getby",
      "click", "hover", "find the element", "find element", "css selector",
      "xpath", "which element", "target element",
    ],
    status: "Reviewing selectors…",
  },
  {
    keywords: [
      "config", "configuration", "playwright.config", "timeout", "retries",
      "reporter", "project", "environment variable", "headless", "ci ",
    ],
    status: "Checking test configuration…",
  },
  {
    keywords: [
      "example", "generate", "write a", "show me", "sample",
      "how do i write", "how to write", "code for", "snippet",
    ],
    status: "Generating Playwright example…",
  },
];

export function getThinkingStatus(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  for (const { keywords, status } of KEYWORD_STATUSES) {
    if (keywords.some((keyword) => lower.includes(keyword))) return status;
  }
  return "Searching Playwright docs…";
}
