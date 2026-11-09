import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, leadColumns, leadsCsv, type Lead } from "./csv.ts";

const lead = (fields: Record<string, string>): Lead => ({ id: "1", created: "2026-11-09T10:00:00+0000", fields, adName: null, campaignName: "C", platform: "fb", isOrganic: false });

test("csv neutralises spreadsheet formulas and escapes quotes", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
  assert.equal(csvCell("+91 98"), `"'+91 98"`);
  assert.equal(csvCell('say "hi"'), `"say ""hi"""`);
});

test("contact columns come first, then the rest alphabetically", () => {
  assert.deepEqual(leadColumns([lead({ zeta: "z", email: "a@b.c", full_name: "A", budget: "x" })]), ["full_name", "email", "budget", "zeta"]);
});

test("csv has BOM, header and one row per lead", () => {
  const out = leadsCsv([lead({ full_name: "Asha", phone_number: "+919999" })]);
  assert.ok(out.startsWith("﻿"));
  const lines = out.trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /"Full Name","Phone Number"/);
  assert.match(lines[1], /"Asha","'\+919999"/);
});
