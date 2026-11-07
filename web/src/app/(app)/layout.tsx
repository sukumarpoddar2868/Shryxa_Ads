import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { logoutAction } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/dal";

/**
 * Authenticated app shell. The chrome is static (prerendered); anything that
 * reads the session streams in behind a Suspense boundary.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-lavender-soft md:flex-row">
      <aside className="flex shrink-0 items-center justify-between gap-4 bg-ink px-4 py-3 text-paper md:sticky md:top-0 md:h-dvh md:w-60 md:flex-col md:items-stretch md:justify-start md:px-4 md:py-6">
        <Link href="/dashboard" className="px-2 md:mb-8" aria-label="Shryxa Ads dashboard">
          <Wordmark className="text-[26px] text-paper" />
        </Link>
        <SidebarNav />
        <div className="md:mt-auto">
          <Suspense fallback={<div className="h-10" />}>
            <UserBadge />
          </Suspense>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 md:py-10">
        <div className="mx-auto max-w-[1200px]">
          <Suspense fallback={<PageSkeleton />}>
            <Gate>{children}</Gate>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}

async function UserBadge() {
  const user = await requireUser();
  return (
    <div className="flex items-center gap-2 md:flex-col md:items-stretch">
      <p className="hidden truncate px-2 text-[13px] text-paper/60 md:block" title={user.email}>
        {user.email}
      </p>
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-pill px-4 py-2.5 text-[15px] font-bold text-paper/75 hover:bg-paper/10 hover:text-paper"
        >
          <LogOut aria-hidden className="size-[18px]" strokeWidth={1.75} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </form>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy className="animate-pulse space-y-4">
      <div className="h-9 w-56 rounded-card bg-paper" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-card bg-paper" />
        ))}
      </div>
    </div>
  );
}
