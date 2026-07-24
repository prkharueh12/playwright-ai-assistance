# Architecture

Korso Agent is a RAG (retrieval-augmented generation) chatbot that answers
Playwright testing questions, grounded in the official Playwright
documentation. It supports three LLM providers — OpenAI, Anthropic, and
Google Gemini — on a bring-your-own-key model, wrapped in a fully custom,
branded interface with a day/night photographic theme.

This document covers the system design and the reasoning behind the
notable decisions, including a couple of real performance bugs found and
fixed during development.

## Data Flow

```
User (browser)
  │  message + provider + API key (per-request header, from localStorage)
  ▼
Next.js frontend (chat UI)
  │
  ▼
POST /api/chat
  │
  ▼
RAG pipeline: embed query locally → cosine top-k → relevance gate → build prompt
  │
  ▼
LLM provider (OpenAI | Anthropic | Gemini), called with the user's own key
  │
  ▼
Streaming response, paced and rendered incrementally
```

## Key Design Decisions

**Bring-your-own-key, not a hosted key.** The user's API key lives only in
`localStorage` and is forwarded per-request via header
(`x-provider-key`) to `/api/chat`, used for exactly one call, and never
persisted, cached, or logged server-side. This keeps the app free to
operate (no LLM spend on the app owner's side) and removes an entire class
of key-leakage risk that comes with holding user secrets server-side.

**Local embeddings instead of a hosted vector database.** Retrieval runs
entirely offline against a prebuilt index of the Playwright docs
(~1,180 chunks), embedded with a local ONNX model
(`@xenova/transformers`, `Xenova/all-MiniLM-L6-v2`) and searched with a
plain in-memory cosine similarity scan. At this corpus size (a few hundred
pages), that comfortably outperforms the operational overhead of a hosted
vector DB — no extra service, no network hop — and retrieval never depends
on which LLM provider key the user happens to bring, since it's a separate
model from the one answering the question.

**Relevance gating on retrieval.** Cosine similarity has no built-in
cutoff — retrieval always returns its top-k chunks whether or not any of
them are actually relevant. A calibrated threshold (~0.3, based on the
real score distribution: on-topic queries scored 0.37–0.66 in testing,
off-topic chitchat topped out around 0.24) decides whether retrieved
context and citations get used at all, so an off-topic refusal never shows
an irrelevant source list underneath it.

**Citations computed, not always rendered.** The retrieval layer always
attaches source URLs to message metadata, but the chat UI deliberately
shows only the assistant's answer text — a product decision to keep the
conversation visually uncluttered, made after trying the "Sources" block
in the UI and removing it.

**Day/night theming as its own system, not `prefers-color-scheme`.** The
UI's visual theme (a photographic background, glass-panel treatments, and
a gold accent color) is driven by a `[data-scene="day"|"night"]` attribute
that resolves independently from light/dark mode preference — a three-way
toggle (light / dark / system) where "system" re-resolves on a timer at
the actual local day/night boundary, not just the OS's light/dark setting.

## Performance: Debugging a Real Regression

Early testing surfaced a specific, reproducible complaint: typing in the
message box felt fine early in a conversation, but grew noticeably laggier
the longer the conversation ran — a symptom that pointed at rendering cost
scaling with message count, not network latency.

Profiling with a scripted Playwright harness (simulated keystrokes,
measuring browser "long tasks" during typing) confirmed it with hard
numbers:

| Conversation length | Time to type 60 characters | Blocking long tasks |
|---|---|---|
| Empty | 2.3s | 0 |
| 12 exchanges (24 messages) | 26s | 57, ~430ms each |

**Root cause:** the message component wasn't memoized, so every keystroke
in the prompt input re-rendered the entire message list — including
re-running markdown parsing and syntax highlighting for every historical
message, on every character typed. The cost scaled directly with
conversation length because the render tree did.

**Fix:** wrapped the message component in `React.memo`. Since a historical
message's props are reference-stable once rendered, unchanged messages now
skip re-rendering entirely regardless of what's being typed elsewhere.
Re-measured after the fix: 2.3s and zero long tasks, at any conversation
length — back to the empty-conversation baseline.

Two related fixes came out of the same investigation:
- The auto-scroll-to-bottom effect was calling `el.scrollTop =
  el.scrollHeight` on every single streamed token — a forced synchronous
  layout reflow dozens of times a second during a response. Throttled to
  fire at most once per `requestAnimationFrame`.
- The avatar's "thinking" indicator was continuously animating
  `box-shadow`, which forces a repaint on every animated frame. Switched
  to a static shadow plus a `transform: scale` keyframe — `transform` is
  compositor-only and animates for free.

A separate case, verified the same way: a report that the assistant's
reply "took too long" turned out to be genuine LLM provider latency, not
app code — instrumented and measured time-to-first-token directly, which
showed one provider taking 7-9s to start responding to a one-word
greeting versus another consistently under 1s for the same input.
Distinguishing "our code is slow" from "the provider is slow" required
actually measuring both, not guessing from the symptom.

## Visual Design System

- **Brand:** a custom mascot character and a Moraine Lake day/night photo
  pair as the full-bleed background, `position: fixed` so it stays pinned
  even if foreground content scrolls on mobile.
- **Color:** a single gold accent (`--gold-day` / `--gold-night` CSS
  custom properties), sampled from the mascot artwork rather than picked
  arbitrarily, used consistently across every themed element instead of
  hardcoding a color per component.
- **Glass panels:** `backdrop-filter: blur(30px) saturate(180%)` with a
  light or dark translucent fill depending on scene.
- **Responsive:** built by measuring, not eyeballing — a scripted
  Playwright diagnostic captured element bounding boxes across five
  viewport widths to precisely locate and confirm the fix for real overlap
  bugs on narrow screens, rather than guessing from a single screenshot.

## Tech Stack

- **Framework:** Next.js (App Router, Turbopack), deployed on Vercel
- **UI:** React 19, Tailwind CSS v4, shadcn/ui
- **AI:** Vercel AI SDK, with `@ai-sdk/openai` / `@ai-sdk/anthropic` /
  `@ai-sdk/google` behind one provider abstraction
- **Retrieval:** `@xenova/transformers` local embedding model, in-memory
  cosine similarity over a prebuilt JSON index
- **Markdown/code rendering:** `react-markdown` + `remark-gfm` +
  `rehype-sanitize`, with `react-syntax-highlighter` trimmed to only the
  languages the docs corpus actually contains (verified against real
  code-fence tags, not the full ~300-language default bundle)

## Project Structure

```
app/
  api/chat/route.ts          RAG orchestration + streaming
  api/validate-key/route.ts  live key validation
  globals.css                design tokens, day/night theming
components/                  chat UI, connect/BYOK flow, background scene
lib/                         RAG pipeline, providers, theming, validation
prompts/system.md            the assistant's system prompt
scripts/                     offline docs ingestion pipeline
data/embeddings/index.json   prebuilt retrieval index (committed)
```
