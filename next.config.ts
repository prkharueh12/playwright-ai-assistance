import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/chat reads prompts/system.md (lib/prompts.ts) and
  // data/embeddings/index.json (lib/retrieval.ts) via fs at runtime rather
  // than a static import, since they're content/data, not code. Next.js's
  // automatic file tracer doesn't reliably pick up plain fs.readFileSync
  // calls on non-code files, so on Vercel the serverless function can ship
  // without them — works fine in local dev (full filesystem access) but
  // 500s in production. This tells the tracer to include them explicitly.
  //
  // The onnxruntime-node binary path is a second, unrelated instance of the
  // same underlying problem: @xenova/transformers depends on
  // onnxruntime-node, which ships a platform-specific native .so binary,
  // not JS. Without serverExternalPackages below, Turbopack tries to
  // bundle/inline that package instead of leaving it as a plain external
  // require(), which breaks the relative path it uses to find the .so file
  // at runtime ("libonnxruntime.so.1.14.0: cannot open shared object
  // file") — confirmed via the actual Vercel function log, not a guess.
  // The trace-include here is a defensive backstop in case NFT doesn't
  // pick the binary up automatically once it's external.
  outputFileTracingIncludes: {
    "/api/chat": [
      "./prompts/system.md",
      "./data/embeddings/index.json",
      "./node_modules/onnxruntime-node/bin/napi-v3/**",
    ],
  },
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node"],
};

export default nextConfig;
