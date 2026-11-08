/**
 * `json.dumps(obj, sort_keys=True)` byte-compatible encoder (", " / ": "
 * separators, ASCII-escaped). Only used to derive the mock lead-form id the
 * same way the Python launcher does, so mock runs stay comparable.
 */
import type { Json } from "./builders.ts";

function str(s: string): string {
  return JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function pyDumpsSorted(v: Json): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v); // form payloads hold no floats
  if (typeof v === "string") return str(v);
  if (Array.isArray(v)) return `[${v.map(pyDumpsSorted).join(", ")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${str(k)}: ${pyDumpsSorted(v[k])}`).join(", ")}}`;
}
