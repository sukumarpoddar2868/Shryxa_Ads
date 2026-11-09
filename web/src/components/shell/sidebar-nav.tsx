"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Megaphone, Users, CreditCard, Store, Inbox, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

type AccountType = "business" | "agency";

/** Reads the URL to highlight the active item. Must render inside <Suspense>. */
export function SidebarNav({ accountType = "agency", isAdmin = false }: { accountType?: AccountType; isAdmin?: boolean }) {
  return <NavLinks accountType={accountType} isAdmin={isAdmin} path={usePathname()} />;
}

/** Hook-free version, safe as a prerendered Suspense fallback. */
export function NavLinks({ accountType = "agency", isAdmin = false, path = "" }: { accountType?: AccountType; isAdmin?: boolean; path?: string }) {
  const items = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/leads", label: "Leads", icon: Inbox },
    { href: "/clients", label: accountType === "business" ? "My business" : "Clients", icon: accountType === "business" ? Store : Users },
    { href: "/account", label: "Account", icon: CreditCard },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];
  return (
    <nav aria-label="Main" className="flex gap-0.5 sm:gap-1 md:flex-col">
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={label}
            className={cn(
              "flex items-center gap-3 rounded-pill px-3 py-2.5 sm:px-4 text-[15px] font-bold transition-colors md:group-data-[collapsed=true]/sidebar:justify-center md:group-data-[collapsed=true]/sidebar:px-0",
              active ? "bg-chartreuse text-ink" : "text-paper/75 hover:bg-paper/10 hover:text-paper",
            )}
          >
            <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
            <span className="hidden sm:inline md:group-data-[collapsed=true]/sidebar:hidden">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
