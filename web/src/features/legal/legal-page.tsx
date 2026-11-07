import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Mail, MessageCircle } from "lucide-react";
import { SiteNav } from "@/features/marketing/components/site-nav";
import { SiteFooter } from "@/features/marketing/sections";
import { cn } from "@/lib/cn";
import { CONTACT, LAST_UPDATED, LEGAL_DOCS, type LegalDoc } from "./content";

/** Typography for policy Markdown — tuned for long-form reading (~70ch). */
const md: Components = {
  h2: ({ children }) => (
    <h2 className="mt-14 scroll-mt-24 border-t border-line pt-10 text-[26px] font-extrabold leading-tight tracking-[-0.02em] first:mt-0 first:border-0 first:pt-0">
      {children}
    </h2>
  ),
  p: ({ children }) => <p className="mt-4 text-[17px] leading-[1.7] text-ink/85">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-4 space-y-2 pl-6 text-[17px] leading-[1.7] text-ink/85 [&>li]:relative [&>li]:before:absolute [&>li]:before:-left-5 [&>li]:before:top-[0.7em] [&>li]:before:size-1.5 [&>li]:before:rounded-full [&>li]:before:bg-tomato [&>li]:before:content-['']">
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-6 text-[17px] leading-[1.7] text-ink/85 marker:font-bold">{children}</ol>,
  strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
  em: ({ children }) => <em className="not-italic font-bold text-lavender-deep">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} className="font-bold text-tomato-700 underline-offset-4 hover:underline">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded-[4px] bg-lavender-soft px-1.5 py-0.5 text-[0.9em]">{children}</code>,
  table: ({ children }) => (
    <div className="mt-6 overflow-x-auto rounded-card bg-lavender-soft">
      <table className="w-full min-w-[520px] border-collapse text-left text-[15px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ink text-paper">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-3 font-bold">{children}</th>,
  td: ({ children }) => <td className="border-t border-paper px-4 py-3 align-top leading-relaxed">{children}</td>,
};

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <SiteNav />
      <main>
        <header className="mesh-hero grain relative overflow-hidden pt-32 pb-16 md:pt-40 md:pb-20">
          <div aria-hidden className="pattern-dots absolute inset-0 text-ink/[0.08] [mask-image:linear-gradient(180deg,black,transparent)]" />
          <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6">
            <p className="inline-flex items-center gap-2 rounded-pill bg-paper/70 px-3 py-1.5 text-[13px] font-bold">
              <FileText className="size-4" aria-hidden /> Legal
            </p>
            <h1 className="mt-5 max-w-[820px] text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[57px]">
              {doc.title}
            </h1>
            <p className="mt-4 text-[17px] font-bold text-ink/70">Last updated {LAST_UPDATED}</p>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-[240px_1fr]">
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="Legal documents">
              <p className="text-[13px] font-extrabold uppercase tracking-wide text-ink-muted">Policies</p>
              <ul className="mt-3 flex flex-wrap gap-2 lg:flex-col">
                {LEGAL_DOCS.map((d) => {
                  const active = d.slug === doc.slug;
                  return (
                    <li key={d.slug}>
                      <Link
                        href={`/${d.slug}`}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "block rounded-pill px-4 py-2 text-[15px] font-bold transition-colors",
                          active ? "bg-chartreuse text-ink" : "text-ink/75 hover:bg-lavender-soft hover:text-ink",
                        )}
                      >
                        {d.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-8 hidden rounded-[10px] bg-lavender-soft p-5 lg:block">
              <p className="text-[15px] font-bold">Questions?</p>
              <a href={`mailto:${CONTACT.email}`} className="mt-3 flex items-center gap-2 break-all text-[14px] text-ink/80 hover:text-tomato-700">
                <Mail className="size-4 shrink-0" aria-hidden /> {CONTACT.email}
              </a>
              <a
                href={`https://wa.me/${CONTACT.whatsapp.replace(/\D/g, "")}`}
                className="mt-2 flex items-center gap-2 text-[14px] text-ink/80 hover:text-tomato-700"
              >
                <MessageCircle className="size-4 shrink-0" aria-hidden /> {CONTACT.whatsapp}
              </a>
            </div>
          </aside>

          <article className="min-w-0 max-w-[760px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
              {doc.body}
            </ReactMarkdown>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
