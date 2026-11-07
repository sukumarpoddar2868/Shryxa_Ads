"use client";

import { useActionState, useMemo, useState } from "react";
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

const STATUS_NOTE: Record<number, string> = { 2: " (disabled)", 3: " (payment due)", 101: " (closed)" };

/** Pick ad account, Page, Instagram and Pixel. Single options are pre-selected. */
export function AssetPicker({ action, adAccounts, pages, pixels, current, submitLabel = "Save selection" }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const only = <T extends { id: string }>(list: T[]) => (list.length === 1 ? list[0].id : "");

  const initialAccount =
    adAccounts.find((a) => a.accountId === current.adAccountId || a.id === current.adAccountId)?.id ?? only(adAccounts);
  const [accountId, setAccountId] = useState(initialAccount);
  const [pageId, setPageId] = useState(current.pageId ?? only(pages));
  const page = useMemo(() => pages.find((p) => p.id === pageId) ?? null, [pages, pageId]);
  const savedAccount = adAccounts.find((a) => a.accountId === current.adAccountId)?.id ?? null;
  const pixelsKnown = accountId === savedAccount;

  if (adAccounts.length === 0 && pages.length === 0) {
    return (
      <Callout tone="error">
        This Facebook login can&apos;t see any ad accounts or Pages. When you connected, Facebook asked which assets to
        share — reconnect and tick the business&apos;s Page and ad account.
      </Callout>
    );
  }

  return (
    <form action={formAction} className="grid gap-5 sm:grid-cols-2">
      <Field id="adAccountId" label="Ad account" hint={adAccounts.length ? undefined : "No ad accounts shared."}>
        <Select id="adAccountId" name="adAccountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">— Choose an ad account —</option>
          {adAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency}
              {a.businessName ? ` · ${a.businessName}` : ""}
              {STATUS_NOTE[a.status] ?? ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="pageId" label="Facebook Page" hint={pages.length ? undefined : "No Pages shared."}>
        <Select id="pageId" name="pageId" value={pageId} onChange={(e) => setPageId(e.target.value)}>
          <option value="">— Choose a Page —</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="instagramId"
        label="Instagram account"
        hint={page && !page.instagram ? "No Instagram linked to this Page — ads will use the Page identity." : undefined}
      >
        <Select id="instagramId" name="instagramId" defaultValue={current.instagramId ?? page?.instagram?.id ?? ""} key={pageId}>
          <option value="">Use Facebook Page identity</option>
          {page?.instagram && <option value={page.instagram.id}>@{page.instagram.username}</option>}
        </Select>
      </Field>

      <Field
        id="pixelId"
        label="Pixel (website ads)"
        hint={pixelsKnown ? (pixels.length ? undefined : "No Pixel on this ad account.") : "Save the ad account first to load its Pixels."}
      >
        <Select id="pixelId" name="pixelId" defaultValue={pixelsKnown ? (current.pixelId ?? only(pixels)) : ""} disabled={!pixelsKnown}>
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
        <Button type="submit" disabled={pending}>
          {pending ? "Checking with Meta…" : submitLabel}
        </Button>
        {state.saved && (
          <p role="status" className="flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 className="size-5 text-lavender-deep" aria-hidden /> Saved
          </p>
        )}
      </div>
      {state.error && (
        <div className="sm:col-span-2">
          <Callout tone="error">{state.error}</Callout>
        </div>
      )}
    </form>
  );
}
