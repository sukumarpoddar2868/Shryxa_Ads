import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "invert";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-bold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  // The single action color. Only this variant carries a shadow.
  primary: "bg-tomato-600 text-paper shadow-cta hover:bg-tomato-700",
  secondary: "bg-transparent text-ink ring-1 ring-inset ring-ink hover:bg-ink hover:text-paper",
  ghost: "bg-transparent text-ink hover:bg-ink/5",
  // Destructive = outline, not a red fill (tomato is reserved for "go").
  danger: "bg-paper text-tomato-700 ring-1 ring-inset ring-ink/30 hover:ring-tomato-700 hover:bg-tomato-soft",
  // For use on ink / dark bands.
  invert: "bg-chartreuse text-ink hover:bg-paper",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-[15px]",
  lg: "h-14 px-8 text-lg",
};

type Common = { variant?: Variant; size?: Size };

export function buttonClass({ variant = "primary", size = "md" }: Common = {}, extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & Common) {
  return <button className={buttonClass({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & Common) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}
