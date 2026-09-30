# Prompt evals

Promptfoo eval suite for the chatbot's RAG pipeline. Correctness and refusal
are evaluated against the app's real production model (Google Gemini,
matching `getModel("google", ...)` — see
[../lib/providers.ts](../lib/providers.ts)); the benchmark suite compares
Gemini/OpenAI/Anthropic independently of production config (see its own
section below).

## Setup

1. `npm install` (installs `promptfoo` and `dotenv-cli`, already in
   `devDependencies`)
2. Add API keys to `.env` at the repo root — `GOOGLE_API_KEY` is required for
   every suite; `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are only needed for
   the benchmark suite:
   ```
   GOOGLE_API_KEY=your-key-here
   OPENAI_API_KEY=your-key-here
   ANTHROPIC_API_KEY=your-key-here
   ```

## Structure

```
prompt-evals/
├── providers/
│   ├── gemini-rag-provider.ts                                        # calls buildRagContext → buildSystemPrompt → generateText, same as /api/chat — used by correctness/refusal only
│   └── pricing.ts                                                     # per-token $ rates for gemini-rag-provider.ts's `cost` field
├── prompts/
│   ├── correctness_grading_rules.txt                                  # grading-rubric prompt for the correctness suite
│   ├── refusal_grading_rules.txt                                      # grading-rubric prompt for the refusal suite's one llm-rubric case
│   └── build_rag_prompt.ts                                            # shared RAG-context prompt function for the benchmark suite (all 3 providers)
├── tests/
│   ├── correctness/
│   │   └── correctness_playwright_qa_promptfooconfig.yaml         # self-contained config + inline, handwritten cases
│   ├── refusal/
│   │   └── refusal_offtopic_adversarial_promptfooconfig.yaml      # self-contained config + inline, handwritten cases
│   └── benchmark/
│       └── benchmark_gemini_vs_openai_vs_anthropic_promptfooconfig.yaml  # cost/latency only, no correctness grading; 3 built-in providers
└── scripts/
    ├── parse-report.ts        # shared: reads a promptfoo -o JSON file, computes pass/fail/duration
    ├── notify-slack.ts        # posts a pass/fail summary to a Slack Incoming Webhook (CI only)
    └── write-summary.ts       # writes the same summary to the GitHub Actions job summary (CI only)
```

CI wiring lives in [../.github/workflows/prompt-evals.yml](../.github/workflows/prompt-evals.yml) —
see the **CI** section below.

Each `*_promptfooconfig.yaml` is fully self-contained — `providers`,
`defaultTest`, and `tests` all live in the one file, no separate cases
file. Filenames are `<category>_<specific-scope>_promptfooconfig.yaml` so
more suites can be added per category later without name collisions
(e.g. a future `tests/correctness/correctness_network_qa_promptfooconfig.yaml`).

## Two different kinds of "prompt" here

- **`prompts:`** in each config — what gets rendered from test vars and
  handed to the provider as the input being tested. Correctness/refusal
  inline this trivially as `["{{query}}"]`; the benchmark suite instead
  points at `prompts/build_rag_prompt.ts`, a shared function that runs the
  real RAG pipeline and returns a rendered chat-message array (see the
  Benchmark section below).
- **`prompts/*_grading_rules.txt`** — a `rubricPrompt` override: plain-text
  instructions for the *grading* model on how to judge pass/fail for that
  category. These never touch the chatbot's own real system prompt
  ([../prompts/system.md](../prompts/system.md)) — you're still testing its
  actual, unmodified production behavior. Each must keep the
  `{reason: string, pass: boolean, score: number}` response-format
  instruction intact, or the grader's output stops parsing. (promptfoo also
  accepts a JSON `[{role, content}, ...]` array here for explicit system/user
  turns, but plain text renders as a single Nunjucks-templated string, which
  is all we need.)

## Running

```bash
npm run eval:correctness_playwright_qa
npm run eval:refusal_offtopic_adversarial
npm run eval:benchmark_provider_comparison
npm run eval:all                         # runs all three, in order
npm run eval:view                        # opens promptfoo's local web UI over every past run
```

Each `eval:*` script loads `.env` via `dotenv-cli` before invoking
`promptfoo eval -c <path-to-that-suite's-config>`. Every run is also saved
to promptfoo's local eval history (`.promptfoo/` in the OS temp/config dir)
and browsable via `eval:view`, or dumped to a file directly with
`npm run eval:refusal_offtopic_adversarial -- -o results.json`.

## Notes

- **Correctness** and **refusal**: see the assertions in each config —
  correctness is model-graded (`llm-rubric`) against a known-good answer per
  case; refusal is deterministic (`type: javascript`, checking
  `context.metadata.retrievedChunkCount`/`citationCount`) wherever possible,
  since it's testing the real relevance gate in
  [../lib/rag.ts](../lib/rag.ts) (`MIN_RELEVANCE_SCORE = 0.3`) rather than
  something that needs a model's judgment. The one adversarial case (asking
  the model to invent a fake API) is model-graded instead, since that query
  legitimately mentions "Playwright" and may pass the relevance gate. Both
  run against the app's real, configured production model via
  `gemini-rag-provider.ts` → `getModel("google", ...)`.
- **Benchmark** measures cost and latency only — no correctness/faithfulness
  grading, no LLM judge, nothing model-graded — across all three providers'
  **cheapest available tier**, deliberately *not* the app's configured
  production models (`gpt-4.1-mini` / `claude-sonnet-4-6` /
  `gemini-3.1-flash-lite` — see `DEFAULT_MODELS` in
  [../lib/providers.ts](../lib/providers.ts)). All three use promptfoo's
  **built-in** providers (`google:gemini-3.5-flash-lite`,
  `openai:gpt-4.1-nano`, `anthropic:messages:claude-haiku-4-5-20251001`) —
  no custom provider classes, no `pricing.ts` entries, since promptfoo
  already has real, maintained cost tables for all three (confirmed against
  its installed source). Notably, `gemini-3.1-flash-lite` — the app's
  *actual* production model — has **no** built-in pricing entry (there's a
  gap between `gemini-2.5-flash-lite` and `gemini-3.5-flash-lite`), which is
  the specific reason this suite uses `3.5-flash-lite` instead;
  `gemini-rag-provider.ts` and `pricing.ts` are untouched and still back the
  correctness/refusal suites against the real production model.
  - All three providers run through the *real* RAG pipeline via the shared
    `prompts/build_rag_prompt.ts` function (`buildRagContext` →
    `buildSystemPrompt`, same as `/api/chat`) — this isn't a raw
    no-context model comparison.
  - Each case groups `cost` + `latency` under one `assert-set`; see the
    comments in
    [tests/benchmark/benchmark_gemini_vs_openai_vs_anthropic_promptfooconfig.yaml](tests/benchmark/benchmark_gemini_vs_openai_vs_anthropic_promptfooconfig.yaml)
    for the exact threshold semantics (AND vs. OR depending on whether the
    assert-set itself has a `threshold`).
  - The cost/latency thresholds in the config are **starting guesses**, not
    measured baselines — this suite hadn't been run for real as of writing.
    Recalibrate after the first real run.
  - Runs with `--no-cache` always (baked into the npm script) — promptfoo's
    `latency` assertion errors on cached results, since there's no
    wall-clock to measure.
  - To swap in a different tier or provider later, just change the
    `providers:` list — no code changes needed unless the model lacks
    built-in pricing (in which case you're back to a custom provider +
    `pricing.ts`, as `gemini-rag-provider.ts` demonstrates).
- All model-graded assertions (correctness/refusal only) pin the grading
  provider explicitly (`google:gemini-3.1-flash-lite`) rather than relying
  on promptfoo's default grader.

## Red-teaming

`red-teaming/` holds promptfoo `redteam` suites — adversarial security
testing (prompt injection, hallucination, overreliance, excessive-agency,
etc.), distinct from the correctness/refusal/benchmark suites above. Each
subfolder is a self-contained `promptfooconfig.yaml`, same one-folder-per-suite
convention as `tests/`:

```
red-teaming/
└── jailbreakBasic/
    ├── promptfooconfig.yaml   # source: target, purpose, plugins, strategies, provider
    └── redteam.yaml           # generated attack cases (gitignored, regenerated every run)
```

- **Target:** the same real `gemini-rag-provider.ts` used by correctness/refusal
  — this tests the actual production RAG pipeline, not a mock.
- **Provider:** `redteam.provider` points at a dedicated custom provider,
  [providers/gemini-redteam-provider.ts](providers/gemini-redteam-provider.ts),
  instead of promptfoo's built-in `google:gemini-3.1-flash-lite` spec. The
  built-in spec silently generated 0 usable test cases for the
  `overreliance` plugin specifically (confirmed via a real run + a raw-fetch
  diagnostic that succeeded with the identical model/prompt where the
  built-in provider failed) — see that file's header comment. Setting
  `redteam.provider` explicitly also means it's not using promptfoo's
  OpenAI-key-present default grader; both attack generation and grading run
  on Gemini (free tier) instead.
- **Rate limits are a real, load-bearing constraint, not just a config
  choice.** Google's Gemini free tier caps out at 15 requests/minute,
  shared between the target and the redteam provider on the same key.
  `numTests: 3`, `maxConcurrency: 1`, and `--delay 5000` (in the npm script)
  together keep every run under that ceiling — confirmed necessary by a real
  run that hit `Quota exceeded ... limit: 15` at the wizard's original
  defaults (`numTests: 5`, `maxConcurrency: 4`). Raising `maxConcurrency`
  without removing `--delay` is a no-op — promptfoo forces concurrency to 1
  whenever a delay is set.
- **`jailbreak:meta` was deliberately dropped** from `strategies:` — it's a
  live/iterative strategy hard-wired to promptfoo's remote cloud service
  with no local fallback, which we avoid for the same privacy reason we skip
  promptfoo's native "share" feature.
- **`redteam.purpose` does not support `file://` references** — confirmed by
  a real test where it silently treated the path string itself as the
  purpose text instead of loading the file or erroring. Keep it inline.

**Running:**
```bash
npm run redteam:jailbreak_basic   # generate + evaluate against the real target
npx promptfoo redteam report      # browser UI: severity per plugin, pass/fail, prompts/responses
```
`redteam.yaml` is a generated artifact (gitignored) — deleting it is safe,
the next run regenerates it.

**Not yet wired into CI** — red-teaming is slower and more rate-limit-fragile
than the other suites, and its output (severity-ranked findings) is closer
to a security review than a binary pass/fail, so it doesn't fit the same
scheduled-run model. The intended cadence is closer to "before a big
release" or "whenever the attack surface changes" (new system prompt, new
capability, model upgrade) than a weekly schedule.

## CI

[../.github/workflows/prompt-evals.yml](../.github/workflows/prompt-evals.yml)
runs weekly (Monday 07:00 UTC, offset an hour from `refresh-docs.yml`'s
slot) and on manual dispatch:

- **`correctness-and-refusal`** job runs on both the schedule and manual
  dispatch — cheap enough (single Gemini provider) to run unattended.
- **`benchmark`** job only runs on manual dispatch (`if: github.event_name
  == 'workflow_dispatch'`) — 3x the API calls per case, and its thresholds
  are still unmeasured guesses, so it's not something to run unattended yet.
- **Nothing fails the build.** Each `promptfoo eval` step has
  `continue-on-error: true` — a failing suite reports, it doesn't block. This
  can be promoted to a hard gate later once thresholds are calibrated
  against real data.
- **Two outputs per suite, both `if: always()`:** a GitHub Actions job
  summary (`write:summary`) and a Slack message (`notify:slack`), each
  reading the same `-o <suite>-results.json` file via the shared
  `parse-report.ts`. If a run crashes before producing any results (e.g. a
  missing secret a built-in provider validates upfront), both still post —
  a "failed to run" message instead of stats.

**Required GitHub secrets** (Settings → Secrets and variables → Actions),
matching the local `.env` names exactly: `GOOGLE_API_KEY`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SLACK_WEBHOOK_URL` (a Slack
Incoming Webhook URL — Features → Incoming Webhooks on your Slack app, not
the Bot/App-Level tokens from Slack's newer app-development flow, which
are for a different kind of integration entirely).

`*-results.json` files are gitignored — they're run artifacts, not source.
