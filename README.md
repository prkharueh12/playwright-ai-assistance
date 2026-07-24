# Korso Agent

A RAG chatbot that answers Playwright questions, grounded in the official
Playwright documentation. Bring your own API key (OpenAI, Anthropic, or
Google Gemini) — nothing is stored server-side.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), add your API key for
whichever provider you want in the modal, and start asking Playwright
questions.

## Docs ingestion pipeline

The chatbot answers from a local, pre-built index of the Playwright docs
(`data/embeddings/index.json`) rather than calling out to the docs site at
request time. To rebuild that index from the latest `microsoft/playwright`
docs:

```bash
npm run ingest
```

This runs the full pipeline (fetch → parse → chunk → embed) and writes
`data/embeddings/index.json`. Each stage can also be run and inspected on
its own:

```bash
npm run ingest:fetch  # pulls docs/src/**.md from GitHub into data/raw-docs/
npm run ingest:parse  # strips frontmatter/directives, prints a summary
npm run ingest:chunk  # H2/H3-based chunking, prints token-size stats
```

`data/raw-docs/` is gitignored (re-fetched on demand); the generated
`data/embeddings/index.json` is committed so the app has something to serve
without requiring a fresh ingestion run.

A GitHub Action (`.github/workflows/refresh-docs.yml`) re-runs this weekly
and on-demand, committing the refreshed index if the docs changed. It hasn't
been exercised in a live Actions run yet — worth a smoke test after the
first push.

## Learn more

Built with [Next.js](https://nextjs.org), the [Vercel AI SDK](https://ai-sdk.dev),
and a local [`@xenova/transformers`](https://www.npmjs.com/package/@xenova/transformers)
embedding model (`Xenova/all-MiniLM-L6-v2`) for retrieval.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system design, key
technical decisions, and a couple of real performance bugs found and fixed
along the way.
