import { cn } from "@/lib/cn";

/** The lowercase `shryxa` wordmark — always weight 800, always lowercase. */
export function Wordmark({ className, dot = true }: { className?: string; dot?: boolean }) {
  return (
    <span className={cn("font-extrabold lowercase leading-none tracking-[-0.02em]", className)}>
      shryxa
      {dot && <span className="text-tomato">.</span>}
    </span>
  );
}
