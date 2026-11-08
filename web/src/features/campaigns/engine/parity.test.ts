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
    assert.deepEqual(ops, c.operations, "operations");

    const run = runMock(spec, ops);
    assert.equal(run.ids.lead_form ?? null, c.mock.form_id, "mock lead form id");
    assert.deepEqual(
      run.steps.filter((s) => s.step > 0).map(({ step, endpoint, payload, id }) => ({ step, endpoint, payload, id })),
      c.mock.steps,
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
