"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { CONTACT_FIELDS, MAX_FORM_QUESTIONS, isHttpsUrl, type ContactField, type DraftLeadForm } from "./blueprint";
import type { SectionProps } from "./create-campaign";
import { TextArea } from "./sections";

/** Instant form: name, contact fields (pre-filled by Meta), qualifying questions, privacy link, thank-you. */
export function LeadFormEditor({ draft, update }: Pick<SectionProps, "draft" | "update">) {
  const f = draft.ad.leadForm;
  const set = (patch: Partial<DraftLeadForm>) => update((d) => ({ ...d, ad: { ...d.ad, leadForm: { ...d.ad.leadForm, ...patch } } }));
  const privacyBad = f.privacyUrl.trim() !== "" && !isHttpsUrl(f.privacyUrl);

  const toggleField = (k: ContactField) =>
    set({ fields: f.fields.includes(k) ? f.fields.filter((x) => x !== k) : [...f.fields, k] });

  return (
    <div className="flex flex-col gap-5 rounded-card bg-lavender-soft p-4 sm:p-5">
      <div>
        <p className="text-[15px] font-extrabold">Instant form</p>
        <p className="text-[13px] text-ink-muted">Opens inside Facebook/Instagram when someone taps the button. Fewer questions = more leads.</p>
      </div>

      <Field id="form-name" label="Form name" hint="Only you see this. A date is added automatically so every launch gets a unique name.">
        <Input id="form-name" className="bg-paper" value={f.name} placeholder={`${draft.setup.businessName || "Business"} enquiry`} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold">Contact details to collect</legend>
        <p className="text-[12px] text-ink-muted">Meta fills these in from the person&apos;s profile — they only confirm.</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CONTACT_FIELDS) as ContactField[]).map((k) => {
            const on = f.fields.includes(k);
            return (
              <label key={k} className={cn("flex cursor-pointer items-center gap-2 rounded-pill px-3 py-1.5 text-[13px] font-bold ring-1 ring-inset", on ? "bg-chartreuse-soft ring-ink" : "bg-paper ring-line")}>
                <input type="checkbox" className="size-3.5 accent-lavender-deep" checked={on} onChange={() => toggleField(k)} />
                {CONTACT_FIELDS[k]}
              </label>
            );
          })}
        </div>
        {f.fields.length === 0 && <p className="text-[12px] text-tomato-700">Pick at least one contact detail — usually phone number.</p>}
      </fieldset>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-bold">Qualifying questions (optional)</p>
        <p className="text-[12px] text-ink-muted">Short answers that help you call the best leads first. AI suggested these from your business.</p>
        {f.questions.map((q, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`Question ${i + 1}`}
              className="bg-paper"
              value={q}
              maxLength={80}
              aria-invalid={!q.trim() || undefined}
              placeholder="e.g. Salaried or self-employed?"
              onChange={(e) => set({ questions: f.questions.map((x, j) => (j === i ? e.target.value : x)) })}
            />
            <button
              type="button"
              aria-label={`Remove question ${i + 1}`}
              onClick={() => set({ questions: f.questions.filter((_, j) => j !== i) })}
              className="grid size-9 shrink-0 place-items-center rounded-full text-tomato-700 hover:bg-paper"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        <Button type="button" variant="ghost" className="self-start" disabled={f.questions.length >= MAX_FORM_QUESTIONS} onClick={() => set({ questions: [...f.questions, ""] })}>
          <Plus className="size-4" aria-hidden /> Add question
        </Button>
      </div>

      <Field
        id="privacy"
        label="Privacy policy link"
        error={privacyBad ? "Enter a full link starting with https://" : undefined}
        hint="Required by Meta. Prefilled with Shryxa's privacy page — if the business has its own privacy page, use that instead (it should say how the business uses these contact details)."
      >
        <Input id="privacy" type="url" className="bg-paper" placeholder="https://yourwebsite.com/privacy" value={f.privacyUrl} aria-invalid={privacyBad || undefined} onChange={(e) => set({ privacyUrl: e.target.value })} />
      </Field>

      <Field id="thanks" label="Thank-you message" hint="Shown after the form is sent — say what happens next.">
        <TextArea id="thanks" className="bg-paper" rows={2} max={160} value={f.thankYou} onChange={(v) => set({ thankYou: v })} />
      </Field>
    </div>
  );
}
