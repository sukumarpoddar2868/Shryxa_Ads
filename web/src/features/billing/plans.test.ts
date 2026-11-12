import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAccess, fromRazorpay, isOwnPlan } from "./plans.ts";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const iso = (days: number) => new Date(NOW + days * 86_400_000).toISOString();
const base = { status: null as string | null, trialEndsAt: null as string | null, periodEnd: null as string | null, isAdmin: false };

test("trial: allowed until trial_ends_at", () => {
  assert.equal(computeAccess({ ...base, status: "trialing", trialEndsAt: iso(1) }, NOW).allowed, true);
  const done = computeAccess({ ...base, status: "trialing", trialEndsAt: iso(-1) }, NOW);
  assert.equal(done.allowed, false);
  assert.equal(done.state, "expired");
});

test("active: allowed while the period is paid", () => {
  assert.equal(computeAccess({ ...base, status: "active", periodEnd: iso(10) }, NOW).allowed, true);
  assert.equal(computeAccess({ ...base, status: "active", periodEnd: iso(-1) }, NOW).allowed, false);
});

test("cancelled / failed payment keep access until period end", () => {
  assert.equal(computeAccess({ ...base, status: "canceled", periodEnd: iso(3) }, NOW).allowed, true);
  assert.equal(computeAccess({ ...base, status: "past_due", periodEnd: iso(-3) }, NOW).allowed, false);
});

test("admin always allowed", () => {
  assert.equal(computeAccess({ ...base, status: "expired", isAdmin: true }, NOW).allowed, true);
});

test("razorpay status mapping", () => {
  assert.equal(fromRazorpay("active"), "active");
  assert.equal(fromRazorpay("halted"), "past_due");
  assert.equal(fromRazorpay("cancelled"), "canceled");
  assert.equal(fromRazorpay("created"), null);
});

test("only a subscription on our own plan is ours (shared Razorpay account)", () => {
  const own = ["plan_ads_inr", undefined];
  assert.equal(isOwnPlan("plan_ads_inr", own), true);
  assert.equal(isOwnPlan("plan_other_app", own), false);
  assert.equal(isOwnPlan(undefined, own), false);
  assert.equal(isOwnPlan("", [undefined, undefined]), false);
});
