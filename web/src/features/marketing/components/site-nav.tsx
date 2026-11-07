"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const links = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#placements", label: "Placements" },
  { href: "/#plans", label: "Plans" },
  { href: "/#faq", label: "FAQ" },
];

/** Transparent over the hero; turns into a frosted bar once you scroll. */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300",
        scrolled ? "bg-paper/80 shadow-[0_1px_0_var(--color-line)] backdrop-blur-md" : "bg-transparent",
      )}
    >
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Shryxa Ads home">
          <Wordmark className="text-[22px] sm:text-[24px]" />
        </Link>
        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-pill px-3 py-2 text-[15px] font-bold text-ink/80 hover:bg-ink/5 hover:text-ink">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1 sm:gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm" className="shadow-cta-sm">
            Start free
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}
