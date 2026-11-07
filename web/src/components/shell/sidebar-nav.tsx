"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Megaphone, Users, CreditCard, Store } from "lucide-react";
import { cn } from "@/lib/cn";

type AccountType = "business" | "agency";

/** Reads the URL to highlight the active item. Must render inside <Suspense>. */
export function SidebarNav({ accountType = "agency" }: { accountType?: AccountType }) {
  return <NavLinks accountType={accountType} path={usePathname()} />;
}

/** Hook-free version, safe as a prerendered Suspense fallback. */
export function NavLinks({ accountType = "agency", path = "" }: { accountType?: AccountType; path?: string }) {
  const items = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/clients", label: accountType === "business" ? "My business" : "Clients", icon: accountType === "business" ? Store : Users },
    { href: "/account", label: "Account", icon: CreditCard },
  ];
  return (
    <nav aria-label="Main" className="flex gap-1 md:flex-col">
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-pill px-4 py-2.5 text-[15px] font-bold transition-colors",
              active ? "bg-chartreuse text-ink" : "text-paper/75 hover:bg-paper/10 hover:text-paper",
            )}
          >
            <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
