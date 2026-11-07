import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "w-full h-11 rounded-input bg-lavender-soft px-4 text-[15px] text-ink placeholder:text-ink-muted ring-1 ring-inset ring-transparent hover:ring-line focus-visible:outline-2 focus-visible:outline-lavender-deep aria-invalid:ring-tomato-700";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "appearance-none pr-10", className)} {...props} />;
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-tomato-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
