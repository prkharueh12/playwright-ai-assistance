"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import type { ResolvedScene } from "@/lib/theme-mode";

interface Star {
  top: number;
  left: number;
  size: number;
  delay: number;
}

function generateStars(count: number): Star[] {
  return Array.from({ length: count }, () => ({
    top: Math.random() * 62,
    left: Math.random() * 100,
    size: Math.random() * 1.6 + 1,
    delay: Math.random() * 4.5,
  }));
}

// Star positions are random and only make sense once we're on the client —
// generating them during SSR would draw different values than the client's
// own render and trigger a hydration mismatch. Generated lazily on first
// client read and cached module-wide (positions never need to change), via
// useSyncExternalStore rather than useEffect+setState — same hydration-gate
// idiom as useHasMounted in chat-window.tsx, and avoids a synchronous
// setState-in-effect entirely rather than working around the lint rule.
let starsCache: Star[] | null = null;
const noopSubscribe = () => () => {};

function getStarsSnapshot(): Star[] | null {
  if (typeof window === "undefined") return null;
  if (!starsCache) starsCache = generateStars(90);
  return starsCache;
}

function getServerStarsSnapshot(): Star[] | null {
  return null;
}

export function BackgroundScene({ scene }: { scene: ResolvedScene }) {
  const stars = useSyncExternalStore(noopSubscribe, getStarsSnapshot, getServerStarsSnapshot);

  return (
    <div className="scene pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="sky" style={{ opacity: scene === "day" ? 1 : 0 }}>
        <Image src="/Day-Lake.png" alt="" fill priority sizes="100vw" className="object-cover" />
      </div>
      <div className="sky" style={{ opacity: scene === "night" ? 1 : 0 }}>
        <Image src="/Night-Lake.png" alt="" fill sizes="100vw" className="object-cover" />
      </div>

      {stars && (
        <div className="stars-layer" style={{ opacity: scene === "night" ? 1 : 0 }}>
          {stars.map((star, i) => (
            <span
              key={i}
              className="star"
              style={{
                top: `${star.top}%`,
                left: `${star.left}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: `${star.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="water-shimmer" />
      <div className="scene-overlay" />
      <div className="scene-vignette" />
    </div>
  );
}
