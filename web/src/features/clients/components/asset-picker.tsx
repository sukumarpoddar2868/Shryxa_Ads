"use client";

import { startTransition, useActionState, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import type { AssetFormState } from "@/features/meta-connect/assets";
import type { AdAccountOption, PageOption, PixelOption } from "@/features/meta-connect/discovery";

type Props = {
  action: (prev: AssetFormState, form: FormData) => Promise<AssetFormState>;
  adAccounts: AdAccountOption[];
  pages: PageOption[];
  /** Pixels of the currently saved ad account (refreshed after saving). */
  pixels: PixelOption[];
  current: { adAccountId: string | null; pageId: string | null; instagramId: string | null; pixelId: string | null };
  submitLabel?: string;
};

const STATUS_NOTE: Record<number, string> = { 2: " (disabled)", 3: " (payment due)", 7: " (under review)", 101: " (closed)" };

/**
 * Pick ad account, Page, Instagram and Pixel.
 * - Auto-selects only when Facebook shared exactly one option; otherwise the
 *   person must choose (ad account + Page are required).
 * - All fields are controlled and submitted via a transition, so React's
 *   automatic post-action form reset can't blank the dropdowns.
 */
export function AssetPicker({ action, adAccounts, pages, pixels, current, submitLabel = "Save selection" }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const only = <T extends { id: string }>(list: T[]) => (list.length === 1 ? list[0].id : "");

  const savedAccount = adAccounts.find((a) => a.accountId === current.adAccountId || a.id === current.adAccountId) ?? null;
  const savedPage = pages.find((p) => p.id === current.pageId) ?? null;

  const [accountId, setAccountId] = useState(savedAccount?.id ?? only(adAccounts));
  const [pageId, setPageId] = useState(savedPage?.id ?? only(pages));
  const page = useMemo(() => pages.find((p) => p.id === pageId) ?? null, [pages, pageId]);
  const [igId, setIgId] = useState(current.instagramId ?? page?.instagram?.id ?? "");
  const pixelsKnown = Boolean(savedAccount) && accountId === savedAccount?.id;
  const [pixelId, setPixelId] = useState(current.pixelId ?? (pixelsKnown ? only(pixels) : ""));

  const onPage = (id: string) => {
    setPageId(id);
    // Default Instagram to the new Page's linked account (or Page identity).
    setIgId(pages.find((p) => p.id === id)?.instagram?.id ?? "");
  };
  const onAccount = (id: string) => {
    setAccountId(id);
    if (id !== savedAccount?.id) setPixelId("");
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };

  if (adAccounts.length === 0 && pages.length === 0) {
    return (
      <Callout tone="error">
        This Facebook login can&apos;t see any ad accounts or Pages. When you connected, Facebook asked which assets to
        share — reconnect and tick the business&apos;s Page and ad account.
      </Callout>
    );
  }

  const many = adAccounts.length > 1 || pages.length > 1;

  return (
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
      {(savedAccount || savedPage) && (
        <p className="rounded-[10px] bg-chartreuse-soft px-4 py-3 text-[14px] sm:col-span-2">
          <strong>Currently saved:</strong> {savedAccount ? savedAccount.name : "no ad account"} ·{" "}
          {savedPage ? savedPage.name : "no Page"}
          {current.instagramId && savedPage?.instagram?.id === current.instagramId && ` · @${savedPage.instagram.username}`}
        </p>
      )}
      {many && !savedAccount && (
        <p className="text-[14px] text-ink-muted sm:col-span-2">
          Facebook shared {adAccounts.length} ad account{adAccounts.length === 1 ? "" : "s"} and {pages.length} Page
          {pages.length === 1 ? "" : "s"}. Choose the ones that belong to this business.
        </p>
      )}

      <Field id="adAccountId" label="Ad account" hint={adAccounts.length ? undefined : "No ad accounts shared."}>
        <Select id="adAccountId" name="adAccountId" value={accountId} onChange={(e) => onAccount(e.target.value)} required>
          <option value="" disabled>
            — Choose an ad account —
          </option>
          {adAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency} · ID {a.accountId}
              {a.businessName ? ` · ${a.businessName}` : ""}
              {STATUS_NOTE[a.status] ?? ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="pageId" label="Facebook Page" hint={pages.length ? undefined : "No Pages shared."}>
        <Select id="pageId" name="pageId" value={pageId} onChange={(e) => onPage(e.target.value)} required>
          <option value="" disabled>
            — Choose a Page —
          </option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.instagram ? ` · @${p.instagram.username}` : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="instagramId"
        label="Instagram account"
        hint={page && !page.instagram ? "No Instagram linked to this Page — ads will use the Page identity." : undefined}
      >
        <Select id="instagramId" name="instagramId" value={igId} onChange={(e) => setIgId(e.target.value)}>
          <option value="">Use Facebook Page identity</option>
          {page?.instagram && <option value={page.instagram.id}>@{page.instagram.username}</option>}
        </Select>
      </Field>

      <Field
        id="pixelId"
        label="Pixel (website ads)"
        hint={pixelsKnown ? (pixels.length ? undefined : "No Pixel on this ad account.") : "Save the ad account first to load its Pixels."}
      >
        {/* Not `disabled`: disabled fields aren't submitted. Locked via aria + pointer instead. */}
        <Select
          id="pixelId"
          name="pixelId"
          value={pixelsKnown ? pixelId : ""}
          onChange={(e) => setPixelId(e.target.value)}
          aria-disabled={!pixelsKnown}
          tabIndex={pixelsKnown ? undefined : -1}
          className={pixelsKnown ? undefined : "pointer-events-none opacity-60"}
        >
          <option value="">No Pixel</option>
          {pixelsKnown &&
            pixels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </Field>

      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <Button type="submit" disabled={pending || !accountId || !pageId}>
          {pending ? "Checking with Meta…" : submitLabel}
        </Button>
        {state.saved && !pending && (
          <p role="status" className="flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 className="size-5 text-lavender-deep" aria-hidden /> Saved
          </p>
        )}
        {(!accountId || !pageId) && <p className="text-[13px] text-ink-muted">Choose an ad account and a Page to continue.</p>}
      </div>
      {state.error && (
        <div className="sm:col-span-2">
          <Callout tone="error">{state.error}</Callout>
        </div>
      )}
    </form>
  );
}
