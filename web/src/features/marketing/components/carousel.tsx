"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Accessible scroll-snap carousel: swipe/scroll natively, arrow buttons,
 * dot indicators, optional autoplay that pauses on hover/focus/hidden tab
 * and never runs under prefers-reduced-motion.
 */
export function Carousel({
  label,
  children,
  autoplay = 0,
  tone = "light",
  slideClassName,
}: {
  label: string;
  children: ReactNode;
  autoplay?: number;
  tone?: "light" | "dark";
  slideClassName?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const slides = Children.toArray(children);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = el.children.length;
    const target = el.children[((i % n) + n) % n] as HTMLElement;
    el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }, []);

  // Track which slide is most visible.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            setActive(Array.prototype.indexOf.call(el.children, e.target));
          }
        }
      },
      { root: el, threshold: [0.6] },
    );
    Array.from(el.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!autoplay || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (!document.hidden) goTo(active + 1);
    }, autoplay);
    return () => clearInterval(t);
  }, [autoplay, paused, active, goTo]);

  const btn =
    tone === "dark"
      ? "bg-paper/10 text-paper hover:bg-chartreuse hover:text-ink"
      : "bg-paper text-ink hover:bg-ink hover:text-paper";

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={track}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6"
      >
        {slides.map((s, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
            className={cn("shrink-0 snap-start", slideClassName)}
          >
            {s}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex gap-2" role="tablist" aria-label={`${label} slides`}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                "h-2.5 rounded-pill transition-all",
                i === active ? "w-8 bg-tomato" : cn("w-2.5", tone === "dark" ? "bg-paper/30" : "bg-ink/20"),
              )}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Previous slide" onClick={() => goTo(active - 1)} className={cn("grid size-11 place-items-center rounded-pill transition-colors", btn)}>
            <ArrowLeft className="size-5" strokeWidth={2} />
          </button>
          <button type="button" aria-label="Next slide" onClick={() => goTo(active + 1)} className={cn("grid size-11 place-items-center rounded-pill transition-colors", btn)}>
            <ArrowRight className="size-5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </section>
  );
}
