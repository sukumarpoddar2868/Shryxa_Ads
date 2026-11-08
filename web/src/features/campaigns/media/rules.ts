/** Upload rules shared by the browser (pre-checks) and the server (enforced). */

export type MediaKind = "image" | "video";

export const MEDIA_RULES: Record<MediaKind, { types: Record<string, string>; maxBytes: number; label: string }> = {
  // Meta allows up to 30 MB per image.
  image: { types: { "image/jpeg": "jpg", "image/png": "png" }, maxBytes: 30 * 1024 * 1024, label: "JPG or PNG, up to 30 MB" },
  // Bucket limit (Supabase free plan). Meta itself allows far larger videos.
  video: { types: { "video/mp4": "mp4", "video/quicktime": "mov" }, maxBytes: 50 * 1024 * 1024, label: "MP4 or MOV, up to 50 MB" },
};

export const MEDIA_BUCKET = "ad-media";

/** What the draft keeps for an uploaded file. `previewUrl` is a local blob URL. */
export type MediaRef = {
  kind: MediaKind;
  path: string;
  previewUrl: string;
  name: string;
  size: number;
  width: number;
  height: number;
  /** Video only: auto-captured cover image, stored next to it. */
  durationSec?: number;
  thumbnail?: { path: string; previewUrl: string };
};

export function checkFile(kind: MediaKind, type: string, size: number): string | null {
  const rule = MEDIA_RULES[kind];
  if (!rule.types[type]) return `Use ${rule.label.split(",")[0]}.`;
  if (size > rule.maxBytes) return `File is too large — ${rule.label}.`;
  return null;
}

/** Aspect check: "1:1" → 1. Returns a friendly warning when far off (±4%). */
export function aspectWarning(width: number, height: number, aspect: string): string | null {
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h || !width || !height) return null;
  const want = w / h;
  const got = width / height;
  return Math.abs(got - want) / want > 0.04 ? `This file is ${width}×${height}; ${aspect} works best here — Meta will crop it.` : null;
}

export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
