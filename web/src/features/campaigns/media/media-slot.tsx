"use client";

import { useId, useRef, useState } from "react";
import { Film, Image as ImageIcon, RefreshCw, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { createUploadAction, deleteMediaAction } from "./actions";
import { MEDIA_RULES, aspectWarning, checkFile, fmtBytes, type MediaKind, type MediaRef } from "./rules";

/** PUT a file to its signed URL with progress (fetch has no upload progress). */
function putWithProgress(url: string, body: Blob, type: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(body);
  });
}

async function uploadBlob(clientId: number, kind: MediaKind, blob: Blob, onProgress: (pct: number) => void): Promise<string> {
  const start = await createUploadAction({ clientId, kind, contentType: blob.type, size: blob.size });
  if (!start.ok) throw new Error(start.error);
  await putWithProgress(start.signedUrl, blob, blob.type, onProgress);
  return start.path;
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("That image couldn't be read."));
    img.src = url;
  });
}

/** Video size/duration + a JPEG cover grabbed ~1 s in (or the middle of short clips). */
function videoInfo(url: string): Promise<{ width: number; height: number; duration: number; cover: Blob }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onerror = () => reject(new Error("That video couldn't be read. Try an MP4 (H.264)."));
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 2) / 2);
    };
    v.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext("2d")?.drawImage(v, 0, 0);
      canvas.toBlob(
        (cover) => (cover ? resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, cover }) : reject(new Error("Couldn't capture a cover image."))),
        "image/jpeg",
        0.9,
      );
    };
    v.src = url;
  });
}

export function MediaSlot({
  clientId,
  kind,
  aspect,
  label,
  note,
  required,
  value,
  onChange,
  compact,
}: {
  clientId: number | null;
  kind: MediaKind;
  aspect: string;
  label: string;
  note?: string;
  required?: boolean;
  value?: MediaRef;
  onChange: (ref: MediaRef | undefined) => void;
  compact?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const busy = progress !== null;
  const warning = value ? aspectWarning(value.width, value.height, aspect) : null;
  const ratio = aspect.replace(":", " / ");

  const discard = (ref: MediaRef | undefined) => {
    if (!ref) return;
    URL.revokeObjectURL(ref.previewUrl);
    void deleteMediaAction(ref.path);
    if (ref.thumbnail) {
      URL.revokeObjectURL(ref.thumbnail.previewUrl);
      void deleteMediaAction(ref.thumbnail.path);
    }
  };

  const handle = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    if (!clientId) return setError("Choose a client in Start first.");
    const problem = checkFile(kind, file.type, file.size);
    if (problem) return setError(problem);

    const previewUrl = URL.createObjectURL(file);
    try {
      setProgress(0);
      let ref: MediaRef;
      if (kind === "image") {
        const { width, height } = await imageSize(previewUrl);
        const path = await uploadBlob(clientId, "image", file, setProgress);
        ref = { kind, path, previewUrl, name: file.name, size: file.size, width, height };
      } else {
        const info = await videoInfo(previewUrl);
        const path = await uploadBlob(clientId, "video", file, (p) => setProgress(Math.round(p * 0.9)));
        const coverPath = await uploadBlob(clientId, "image", info.cover, (p) => setProgress(90 + Math.round(p / 10)));
        ref = {
          kind,
          path,
          previewUrl,
          name: file.name,
          size: file.size,
          width: info.width,
          height: info.height,
          durationSec: Math.round(info.duration),
          thumbnail: { path: coverPath, previewUrl: URL.createObjectURL(info.cover) },
        };
      }
      discard(value);
      onChange(ref);
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  const Icon = kind === "video" ? Film : ImageIcon;

  return (
    <div className={cn("flex flex-col gap-2", compact ? "w-24 shrink-0" : "items-center text-center")}>
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        accept={Object.keys(MEDIA_RULES[kind].types).join(",")}
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files?.[0]);
        }}
        disabled={busy}
        aria-label={value ? `Replace ${label}` : `Upload ${label}`}
        className={cn(
          "relative grid place-items-center overflow-hidden rounded-input bg-paper text-ink-muted ring-1 ring-inset transition-colors",
          compact ? "size-24" : "w-full max-w-[150px]",
          drag ? "ring-2 ring-lavender-deep" : value ? "ring-line" : "ring-dashed ring-line hover:ring-ink/40",
        )}
        style={compact ? undefined : { aspectRatio: ratio }}
      >
        {value ? (
          kind === "video" ? (
            <video src={value.previewUrl} poster={value.thumbnail?.previewUrl} muted loop playsInline className="size-full object-cover" onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
          ) : (
            // Local blob preview — next/image can't optimise blob: URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.previewUrl} alt="" className="size-full object-cover" />
          )
        ) : (
          <span className="flex flex-col items-center gap-1 p-2 text-[12px]">
            {busy ? <Upload className="size-5 animate-pulse" aria-hidden /> : <Icon className="size-5" aria-hidden />}
            {!compact && !busy && <span>Click or drop</span>}
          </span>
        )}
        {busy && (
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-lavender-soft" aria-hidden>
            <span className="block h-full bg-lavender-deep transition-[width]" style={{ width: `${progress}%` }} />
          </span>
        )}
      </button>

      {!compact && (
        <div>
          <p className="text-[13px] font-bold">
            {label} {required && <span className="text-tomato-700">*</span>}
          </p>
          {note && <p className="text-[12px] text-ink-muted">{note}</p>}
        </div>
      )}

      <div role="status" aria-live="polite" className={cn("text-[12px]", compact && "text-[11px] leading-tight")}>
        {busy && <span className="text-ink-muted">{compact ? `${progress}%` : `Uploading… ${progress}%`}</span>}
        {!busy && value && compact && (
          <span className="sr-only">
            Uploaded, {value.width}×{value.height}
          </span>
        )}
        {!busy && value && !compact && (
          <span className="text-ink-muted">
            {value.width}×{value.height} · {fmtBytes(value.size)}
            {value.durationSec ? ` · ${value.durationSec}s` : ""}
          </span>
        )}
      </div>
      {error && <p className="text-[12px] text-tomato-700">{error}</p>}
      {!busy && warning && <p className="text-[12px] text-tomato-700">{warning}</p>}

      {value && !busy && compact && (
        // Compact (carousel card): dims in a tooltip, icon-only actions.
        <div className="flex justify-center gap-1" title={`${value.width}×${value.height} · ${fmtBytes(value.size)}`}>
          <button type="button" aria-label={`Replace ${label}`} title="Replace" onClick={() => input.current?.click()} className="grid size-7 place-items-center rounded-full hover:bg-paper">
            <RefreshCw className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Remove ${label}`}
            title="Remove"
            onClick={() => {
              discard(value);
              onChange(undefined);
            }}
            className="grid size-7 place-items-center rounded-full text-tomato-700 hover:bg-paper"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
      {value && !busy && !compact && (
        <div className="flex gap-1">
          <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[12px] font-bold hover:bg-paper">
            <RefreshCw className="size-3.5" aria-hidden /> Replace
          </button>
          <button
            type="button"
            onClick={() => {
              discard(value);
              onChange(undefined);
            }}
            className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[12px] font-bold text-tomato-700 hover:bg-paper"
          >
            <Trash2 className="size-3.5" aria-hidden /> Remove
          </button>
        </div>
      )}
    </div>
  );
}
