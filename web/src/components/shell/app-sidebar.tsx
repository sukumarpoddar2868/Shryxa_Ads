"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/cn";

/**
 * App sidebar with a collapse "shutter" (desktop only). Collapsed = icons
 * only, so pages get more room. The choice is remembered in localStorage;
 * children style themselves via `group-data-[collapsed=true]/sidebar:*`.
 */

const KEY = "shryxa.sidebar.collapsed";
const EVENT = "shryxa:sidebar";
let memory = false; // fallback when storage is blocked

function read(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? memory : v === "1";
  } catch {
    return memory;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function AppSidebar({ nav, footer }: { nav: ReactNode; footer: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);

  const toggle = () => {
    memory = !collapsed;
    try {
      localStorage.setItem(KEY, memory ? "1" : "0");
    } catch {
      // storage blocked — in-memory only
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "group/sidebar flex shrink-0 items-center justify-between gap-4 bg-ink px-4 py-3 text-paper md:sticky md:top-0 md:h-dvh md:flex-col md:items-stretch md:justify-start md:py-6 md:transition-[width] md:duration-200 motion-reduce:transition-none",
        collapsed ? "md:w-[76px] md:px-3" : "md:w-60 md:px-4",
      )}
    >
      <div className={cn("flex items-center gap-2 md:mb-8", collapsed ? "md:flex-col md:gap-4" : "md:justify-between")}>
        <Link href="/dashboard" className="px-2" aria-label="Shryxa Ads dashboard">
          {collapsed ? (
            <>
              <Wordmark className="text-[26px] text-paper md:hidden" />
              <span className="hidden text-[26px] leading-none font-extrabold md:inline">
                s<span className="text-tomato">.</span>
              </span>
            </>
          ) : (
            <Wordmark className="text-[26px] text-paper" />
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden size-9 place-items-center rounded-full text-paper/70 hover:bg-paper/10 hover:text-paper md:grid"
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} aria-hidden /> : <PanelLeftClose className="size-[18px]" strokeWidth={1.75} aria-hidden />}
        </button>
      </div>
      {nav}
      <div className="md:mt-auto">{footer}</div>
    </aside>
  );
}
