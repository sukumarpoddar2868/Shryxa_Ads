import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, nameMatches, spellings, splitArea } from "./match.ts";

test("names match across spacing and suffixes", () => {
  assert.equal(nameMatches("Indiranagar", "Indira Nagar"), "exact");
  assert.equal(nameMatches("Andheri", "Andheri East"), "prefix");
  assert.equal(nameMatches("Tungri", "Tungring"), null);
  assert.equal(nameMatches("Saket", "Saketri Village"), null);
  assert.equal(nameMatches("Bari Bazar", "Bara Pukharia"), null);
});

test("distance: Koramangala is ~5 km from Bangalore centre, Tungring is far", () => {
  const blr = { lat: 12.9716, lng: 77.5946 };
  assert.ok(distanceKm(blr, { lat: 12.9259, lng: 77.6229 }) < 7);
  assert.ok(distanceKm({ lat: 22.548, lng: 85.819 }, { lat: 34.0, lng: 74.8 }) > 1000);
});

test("spellings split common suffixes", () => {
  assert.deepEqual(spellings("Indiranagar"), ["Indiranagar", "Indira Nagar"]);
  assert.deepEqual(spellings("HSR Layout"), ["HSR Layout"]);
  assert.deepEqual(spellings("Koramangala"), ["Koramangala"]);
});

test("splitArea", () => {
  assert.deepEqual(splitArea("Koramangala — Bangalore"), { area: "Koramangala", city: "Bangalore" });
  assert.deepEqual(splitArea("Chaibasa, Jharkhand"), { area: "Chaibasa", city: "Jharkhand" });
  assert.deepEqual(splitArea("Chaibasa"), { area: "Chaibasa", city: null });
});
