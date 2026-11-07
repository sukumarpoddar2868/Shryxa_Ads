"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Megaphone, Users, CreditCard } from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/account", label: "Account", icon: CreditCard },
] as const;

export function SidebarNav() {
  const path = usePathname();
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
