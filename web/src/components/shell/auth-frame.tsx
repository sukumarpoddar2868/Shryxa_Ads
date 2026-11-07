import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";

/** Split auth layout: textured brand panel + clean form panel. */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="mesh-hero grain relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Link href="/" aria-label="shryxa home">
          <Wordmark className="text-[34px] text-ink" />
        </Link>
        <div className="max-w-md">
          <p className="text-[51px] font-extrabold leading-[1.05] text-ink">
            ads that launch themselves.
          </p>
          <p className="mt-5 text-[19px] leading-snug text-ink/80">
            Build, preview and launch Meta campaigns for every client — with AI copy and hyper-local targeting.
          </p>
        </div>
        <div aria-hidden className="flex gap-3">
          <span className="h-3 w-16 rounded-pill bg-lavender-deep" />
          <span className="h-3 w-10 rounded-pill bg-chartreuse" />
          <span className="h-3 w-6 rounded-pill bg-tomato" />
        </div>
      </aside>

      <section className="flex items-center justify-center bg-paper px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 inline-block lg:hidden" aria-label="shryxa home">
            <Wordmark className="text-[29px]" />
          </Link>
          <h1 className="text-[29px] font-extrabold leading-tight">{title}</h1>
          <p className="mt-2 mb-8 text-ink-muted">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
