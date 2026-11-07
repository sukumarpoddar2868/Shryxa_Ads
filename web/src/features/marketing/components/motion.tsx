"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const RM_QUERY = "(prefers-reduced-motion: reduce)";
/** true when the user asked for reduced motion (false during SSR). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(RM_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(RM_QUERY).matches,
    () => false,
  );
}

/**
 * Fades + lifts children in when scrolled into view.
 * Renders visible on the server / without JS; only hides once mounted.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Already on screen at mount → don't hide it (avoids a flash).
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) {
      setState("shown");
      return;
    }
    setState("hidden");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-reveal={state === "hidden" ? "hidden" : "shown"}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
      className={className}
    >
      {children}
    </Tag>
  );
}

/** Cycles through words with a slide-up animation. */
export function RotatingWord({ words, interval = 2200, className }: { words: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval, reduced]);

  return (
    <span className={cn("relative inline-block", className)}>
      {/* Screen readers get the full list once, not a ticking value. */}
      <span className="sr-only">{words.join(", ")}</span>
      <span key={i} aria-hidden className="animate-word inline-block">
        {words[i]}
      </span>
    </span>
  );
}

/** Types a list of lines one after another, looping. */
export function TypingLines({ lines, className }: { lines: string[]; className?: string }) {
  const reduced = useReducedMotion();
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const full = lines[line].length;
    const t =
      chars < full
        ? setTimeout(() => setChars((c) => c + 1), 38)
        : setTimeout(() => {
            setLine((l) => (l + 1) % lines.length);
            setChars(0);
          }, 2200);
    return () => clearTimeout(t);
  }, [chars, line, lines, reduced]);

  const shown = reduced ? lines[line] : lines[line].slice(0, chars);

  return (
    <p className={className}>
      <span className="sr-only">{lines[0]}</span>
      <span aria-hidden>
        {shown}
        <span className="animate-caret ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] bg-current" />
      </span>
    </p>
  );
}
