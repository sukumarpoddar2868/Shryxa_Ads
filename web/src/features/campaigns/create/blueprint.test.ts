import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaced, payloadPins, type DraftPin } from "./blueprint.ts";

const base = { why: "" };

test("a Meta area without a map position is still sent, by its id", () => {
  const pins: DraftPin[] = [{ ...base, name: "Chaibasa", lat: null, lng: null, radiusKm: 5, geo: { kind: "city", key: "1020819" } }];
  assert.equal(isPlaced(pins[0]), false);
  assert.deepEqual(payloadPins(pins), [{ lat: 0, lng: 0, radiusKm: 5, geo: { kind: "city", key: "1020819" } }]);
});

test("a circle made from a Meta area is sent as a plain circle (the origin stays in the draft only)", () => {
  const pins: DraftPin[] = [{ ...base, name: "Ranchi", lat: 23.37, lng: 85.325, radiusKm: 3, geo: null, origin: { kind: "city", key: "1040740" } }];
  assert.deepEqual(payloadPins(pins), [{ lat: 23.37, lng: 85.325, radiusKm: 3, geo: null }]);
});

test("a circle with no position can't be targeted and is dropped", () => {
  const pins: DraftPin[] = [{ ...base, name: "Broken", lat: null, lng: null, radiusKm: 3, geo: null }];
  assert.deepEqual(payloadPins(pins), []);
});
