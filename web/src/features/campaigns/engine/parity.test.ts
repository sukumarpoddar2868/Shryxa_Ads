/**
 * Request parity with the legacy Python launcher.
 *   pnpm run test:engine
 * Regenerate fixtures after changing the Python side:
 *   uv run python web/scripts/campaign-parity/gen_fixtures.py   (from repo root)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildAll, type Operation } from "./builders.ts";
import { checkPilotGuard, PilotGuardError } from "./guard.ts";
import { runMock } from "./mock-adapter.ts";
import type { Currency } from "./presets.ts";
import { renderSpec, type RenderInput } from "./render.ts";
import { SpecValidationError, validateSpec } from "./schema.ts";

type PyCase = {
  name: string;
  input: Record<string, unknown>;
  operations: Operation[];
  mock: { form_id: string | null; steps: { step: number; endpoint: string; payload: unknown; id: string }[] };
  render_kwargs?: Record<string, unknown>;
};
const fixtures = JSON.parse(readFileSync(new URL("./__fixtures__/python-parity.json", import.meta.url), "utf8")) as {
  valid: PyCase[];
  invalid: { name: string; input: unknown }[];
};

/**
 * Intentional deviations from the Python launcher (Meta API changes since):
 *   object_story_spec.instagram_actor_id → instagram_user_id (Graph v22+).
 */
function withApiUpdates<T>(v: T): T {
  if (Array.isArray(v)) return v.map(withApiUpdates) as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k === "instagram_actor_id" ? "instagram_user_id" : k, withApiUpdates(x)]),
    ) as T;
  }
  return v;
}

/** Python build_meta_yaml kwargs → TS RenderInput. */
function toRenderInput(k: Record<string, unknown>): RenderInput {
  const s = (key: string) => (k[key] as string | undefined) ?? undefined;
  return {
    client: k.client as RenderInput["client"],
    currency: k.currency as Currency,
    adCopy: k.ad_copy as RenderInput["adCopy"],
    epicenters: k.epicenters as RenderInput["epicenters"],
    dailyBudget: k.daily_budget as number,
    destination: s("destination") === "Lead Form" ? "lead_form" : "website",
    landingPageUrl: s("landing_page_url"),
    leadForm: k.lead_form_config as RenderInput["leadForm"],
    language: s("language"),
    imageHash: s("image_hash"),
    imageHashStory: s("image_hash_story"),
    imageHashPortrait: s("image_hash_portrait"),
    bidStrategy: s("bid_strategy"),
    startDate: s("start_date"),
    endDate: s("end_date"),
    launchStatus: s("launch_status") as RenderInput["launchStatus"],
    stamp: "STAMP",
  };
}

for (const c of fixtures.valid) {
  test(`parity: ${c.name}`, () => {
    if (c.render_kwargs) {
      assert.deepEqual(renderSpec(toRenderInput(c.render_kwargs)), c.input, "rendered spec");
    }
    const spec = validateSpec(c.input);
    const ops = buildAll(spec);
    assert.deepEqual(ops, withApiUpdates(c.operations), "operations");

    const run = runMock(spec, ops);
    assert.equal(run.ids.lead_form ?? null, c.mock.form_id, "mock lead form id");
    assert.deepEqual(
      run.steps.filter((s) => s.step > 0).map(({ step, endpoint, payload, id }) => ({ step, endpoint, payload, id })),
      withApiUpdates(c.mock.steps),
      "mock steps",
    );
  });
}

for (const c of fixtures.invalid) {
  test(`rejects: ${c.name}`, () => {
    assert.throws(() => validateSpec(c.input), SpecValidationError);
  });
}

test("phone OS targeting reaches the ad set payload", () => {
  const c = fixtures.valid.find((x) => x.name === "render_website_inr_epicenters")!;
  const spec = validateSpec(renderSpec({ ...toRenderInput(c.render_kwargs!), deviceOs: "ios", publisherPlatforms: ["instagram"] }));
  const t = buildAll(spec)[1].payload.targeting as Record<string, unknown>;
  assert.deepEqual(t.user_os, ["iOS"]);
  assert.deepEqual(t.device_platforms, ["mobile"]);
  assert.deepEqual(t.publisher_platforms, ["instagram"]);
  const plain = buildAll(validateSpec(renderSpec(toRenderInput(c.render_kwargs!))))[1].payload.targeting as Record<string, unknown>;
  assert.equal("user_os" in plain, false);
});

test("carousel cards become child_attachments", () => {
  const c = fixtures.valid.find((x) => x.name === "render_leadform_inr_variants")!;
  const spec = validateSpec(
    renderSpec({
      ...toRenderInput(c.render_kwargs!),
      carousel: { cards: [{ imageHash: "h1", headline: "Salaried ITR" }, { imageHash: "h2", headline: "GST filing", description: "Monthly returns", link: "https://x.in/gst" }], endCard: true },
    }),
  );
  type LD = { image_hash?: string; link: string; child_attachments: Record<string, unknown>[]; multi_share_optimized: boolean; multi_share_end_card: boolean };
  const creative = buildAll(spec)[2].payload.creative as { asset_feed_spec?: unknown; object_story_spec: { link_data: LD } };
  const ld = creative.object_story_spec.link_data;
  assert.equal(creative.asset_feed_spec, undefined, "no placement variants for carousels");
  assert.equal(ld.image_hash, undefined);
  assert.equal(ld.child_attachments.length, 2);
  assert.deepEqual(ld.child_attachments[1], {
    image_hash: "h2",
    name: "GST filing",
    description: "Monthly returns",
    link: "https://x.in/gst",
    call_to_action: { type: "GET_QUOTE", value: { lead_gen_form_id: "REPLACE_AFTER_LEAD_FORM_CREATED" } },
  });
  assert.equal(ld.child_attachments[0].link, ld.link, "card link defaults to the ad link");
  assert.equal(ld.multi_share_optimized, true);
  assert.equal(ld.multi_share_end_card, true);
  assert.throws(() => validateSpec(renderSpec({ ...toRenderInput(c.render_kwargs!), carousel: { cards: [{ imageHash: "h1", headline: "one" }] } })));
});

test("video ads use video_data with a cover image", () => {
  const c = fixtures.valid.find((x) => x.name === "render_website_inr_epicenters")!;
  const spec = validateSpec(renderSpec({ ...toRenderInput(c.render_kwargs!), video: { videoId: "v123", thumbnailHash: "thumb" } }));
  const oss = (buildAll(spec)[2].payload.creative as { object_story_spec: Record<string, unknown> }).object_story_spec;
  assert.equal(oss.link_data, undefined);
  type LD = { message: string; name: string; description: string };
  const ld = (c.input as { ad: { creative: { object_story_spec: { link_data: LD } } } }).ad.creative.object_story_spec.link_data;
  assert.deepEqual(oss.video_data, {
    video_id: "v123",
    image_hash: "thumb",
    message: ld.message,
    title: ld.name,
    link_description: ld.description,
    call_to_action: { type: "GET_QUOTE", value: { link: "https://kapoorca.in/itr" } },
  });
  assert.match(String(buildAll(spec)[2].payload.name), / — video /);
});

test("custom name, lifetime budget and Advantage+ audience", () => {
  const c = fixtures.valid.find((x) => x.name === "render_website_inr_epicenters")!;
  const spec = validateSpec(
    renderSpec({ ...toRenderInput(c.render_kwargs!), campaignName: "Diwali ITR push", budgetType: "lifetime", dailyBudget: 9000, endDate: "2026-12-31", advantageAudience: true }),
  );
  const [camp, adset] = buildAll(spec);
  assert.equal(camp.payload.name, "Diwali ITR push");
  assert.equal(camp.payload.spend_cap, 900000);
  assert.equal(adset.payload.lifetime_budget, 900000);
  assert.equal(adset.payload.daily_budget, undefined);
  assert.deepEqual((adset.payload.targeting as Record<string, unknown>).targeting_automation, { advantage_audience: 1 });
  assert.match(String(adset.payload.name), /^Diwali ITR push — Ad set STAMP$/);
});

test("routing per objective × destination matches Meta's documented setups", () => {
  const c = fixtures.valid.find((x) => x.name === "render_website_inr_epicenters")!;
  const base = { ...toRenderInput(c.render_kwargs!), leadForm: null };
  const build = (extra: Partial<RenderInput>) => {
    const ops = buildAll(validateSpec(renderSpec({ ...base, ...extra })));
    const adset = ops[1].payload as Record<string, unknown>;
    const ld = ((ops[2].payload.creative as Record<string, unknown>).object_story_spec as Record<string, Record<string, unknown>>).link_data;
    return { ops, adset, ld, objective: ops[0].payload.objective };
  };

  const wa = build({ objective: "OUTCOME_LEADS", destination: "whatsapp", whatsappNumber: "+919876543210" });
  assert.equal(wa.adset.destination_type, "WHATSAPP");
  assert.equal(wa.adset.optimization_goal, "CONVERSATIONS");
  assert.deepEqual(wa.adset.promoted_object, { page_id: "1033691806503292", whatsapp_phone_number: "+919876543210" });
  assert.equal(wa.ld.link, "https://api.whatsapp.com/send");
  assert.deepEqual(wa.ld.call_to_action, { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } });
  assert.doesNotThrow(() => checkPilotGuard(wa.ops, false));

  const call = build({ objective: "OUTCOME_LEADS", destination: "call", phoneNumber: "+91 98765 43210" });
  assert.equal(call.adset.destination_type, "PHONE_CALL");
  assert.equal(call.adset.optimization_goal, "QUALITY_CALL");
  assert.equal(call.adset.promoted_object, undefined);
  assert.deepEqual((call.adset.targeting as Record<string, unknown>).device_platforms, ["mobile"]);
  assert.deepEqual(call.ld.call_to_action, { type: "CALL_NOW", value: { link: "tel:+919876543210" } });
  assert.doesNotThrow(() => checkPilotGuard(call.ops, false));

  const msg = build({ objective: "OUTCOME_ENGAGEMENT", destination: "messenger" });
  assert.deepEqual([msg.adset.destination_type, msg.adset.optimization_goal], ["MESSENGER", "CONVERSATIONS"]);
  assert.deepEqual(msg.ld.call_to_action, { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER" } });

  const ig = build({ objective: "OUTCOME_ENGAGEMENT", destination: "instagram_dm" });
  assert.deepEqual(ig.ld.call_to_action, { type: "INSTAGRAM_MESSAGE", value: { app_destination: "INSTAGRAM_DIRECT" } });

  const aw = build({ objective: "OUTCOME_AWARENESS", destination: "none", frequencyCap: 2, landingPageUrl: null, ctaType: "LEARN_MORE" });
  assert.equal(aw.adset.optimization_goal, "REACH");
  assert.equal("destination_type" in aw.adset, false);
  assert.deepEqual(aw.adset.frequency_control_specs, [{ event: "IMPRESSIONS", interval_days: 7, max_frequency: 2 }]);

  const sales = build({ objective: "OUTCOME_SALES", destination: "website", pixel: { pixelId: "px1", event: "PURCHASE" } });
  assert.equal(sales.adset.optimization_goal, "OFFSITE_CONVERSIONS");
  assert.deepEqual(sales.adset.promoted_object, { pixel_id: "px1", custom_event_type: "PURCHASE" });
  assert.throws(() => checkPilotGuard(sales.ops, false), PilotGuardError);
  assert.doesNotThrow(() => checkPilotGuard(sales.ops, true));
  assert.throws(() => renderSpec({ ...base, objective: "OUTCOME_SALES", destination: "website" }), /Pixel/);
});

test("WhatsApp greeting: pre-filled message or quick questions", () => {
  const c = fixtures.valid.find((x) => x.name === "render_website_inr_epicenters")!;
  const base = { ...toRenderInput(c.render_kwargs!), objective: "OUTCOME_LEADS", destination: "whatsapp" as const, whatsappNumber: "+919876543210" };
  const ld = (extra: Partial<RenderInput>) =>
    ((buildAll(validateSpec(renderSpec({ ...base, ...extra })))[2].payload.creative as Record<string, unknown>).object_story_spec as Record<string, Record<string, unknown>>).link_data;
  const prefill = JSON.parse(String(ld({ whatsappChat: { greeting: "Hi! Thanks for reaching out.", prefill: "I want a quote for ITR filing." } }).page_welcome_message));
  assert.deepEqual(prefill, {
    type: "VISUAL_EDITOR",
    version: 2,
    landing_screen_type: "welcome_message",
    media_type: "text",
    text_format: { customer_action_type: "autofill_message", message: { text: "Hi! Thanks for reaching out.", autofill_message: { content: "I want a quote for ITR filing." } } },
  });
  const qs = JSON.parse(String(ld({ whatsappChat: { greeting: "Hello!", questions: ["Price?", " ", "Timings?"] } }).page_welcome_message));
  assert.equal(qs.text_format.customer_action_type, "ice_breakers");
  assert.deepEqual(qs.text_format.message.ice_breakers, [{ title: "Price?" }, { title: "Timings?" }]);
  assert.equal(ld({}).page_welcome_message, undefined);
});

test("custom and lookalike audiences reach ad set targeting", () => {
  const c = fixtures.valid.find((x) => x.name === "render_website_inr_epicenters")!;
  const t = (extra: Partial<RenderInput>) =>
    buildAll(validateSpec(renderSpec({ ...toRenderInput(c.render_kwargs!), ...extra })))[1].payload.targeting as Record<string, unknown>;
  const with_ = t({ audiences: { include: ["111", "222"], exclude: ["333"] } });
  assert.deepEqual(with_.custom_audiences, [{ id: "111" }, { id: "222" }]);
  assert.deepEqual(with_.excluded_custom_audiences, [{ id: "333" }]);
  assert.ok(with_.geo_locations, "location still applies");
  const core = t({});
  assert.equal("custom_audiences" in core, false);
  assert.equal("excluded_custom_audiences" in core, false);
});

test("pilot guard: blocks website leads, allows instant form", () => {
  const leadCase = fixtures.valid.find((c) => c.name === "render_leadform_inr_variants")!;
  const ops = buildAll(validateSpec(leadCase.input));
  assert.doesNotThrow(() => checkPilotGuard(ops, false));

  const website = ops.map((o) =>
    o.resourceType === "ad_set" ? { ...o, payload: { ...o.payload, destination_type: "WEBSITE" } } : o,
  );
  assert.throws(() => checkPilotGuard(website, false), PilotGuardError);
  assert.doesNotThrow(() => checkPilotGuard(website, true));
});
