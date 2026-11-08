import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { NavLinks, SidebarNav } from "@/components/shell/sidebar-nav";
import { logoutAction } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/dal";

/**
 * Authenticated app shell. The chrome is static (prerendered); anything that
 * reads the session streams in behind a Suspense boundary.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-lavender-soft md:flex-row">
      <AppSidebar
        nav={
          <Suspense fallback={<NavLinks />}>
            <UserNav />
          </Suspense>
        }
        footer={
          <Suspense fallback={<div className="h-10" />}>
            <UserBadge />
          </Suspense>
        }
      />

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 md:py-10">
        <div className="mx-auto max-w-[1400px]">
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

async function UserNav() {
  const user = await requireUser();
  return <SidebarNav accountType={user.accountType} />;
}

async function UserBadge() {
  const user = await requireUser();
  return (
    <div className="flex items-center gap-2 md:flex-col md:items-stretch">
      <p className="hidden truncate px-2 text-[13px] text-paper/60 md:block md:group-data-[collapsed=true]/sidebar:hidden" title={user.email}>
        {user.email}
      </p>
      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="flex w-full items-center gap-3 rounded-pill px-4 py-2.5 text-[15px] font-bold text-paper/75 hover:bg-paper/10 hover:text-paper md:group-data-[collapsed=true]/sidebar:justify-center md:group-data-[collapsed=true]/sidebar:px-0"
        >
          <LogOut aria-hidden className="size-[18px]" strokeWidth={1.75} />
          <span className="hidden sm:inline md:group-data-[collapsed=true]/sidebar:hidden">Sign out</span>
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
