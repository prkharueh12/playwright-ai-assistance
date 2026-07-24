import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/chat reads prompts/system.md (lib/prompts.ts) and
  // data/embeddings/index.json (lib/retrieval.ts) via fs at runtime rather
  // than a static import, since they're content/data, not code. Next.js's
  // automatic file tracer doesn't reliably pick up plain fs.readFileSync
  // calls on non-code files, so on Vercel the serverless function can ship
  // without them — works fine in local dev (full filesystem access) but
  // 500s in production. This tells the tracer to include them explicitly.
  outputFileTracingIncludes: {
    "/api/chat": ["./prompts/system.md", "./data/embeddings/index.json"],
  },
};

export default nextConfig;
