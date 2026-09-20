#!/usr/bin/env node
// A return is a claim until it pastes the command and what the command
// printed. A session that says it understands still invents (S06 -> T56).
//
//   node factory/tools/seatReturn.mjs return.json
//   node factory/tools/seatReturn.mjs --template
//   node factory/tools/seatReturn.mjs --self-test
//
// The runtime is checked against the live catalog, not against a list
// typed into the schema once: factory/runtimes.json is the catalog and
// contracts/seat-return.v1.json must agree with it.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const SHA = /^[0-9a-f]{7,40}$/i;

const TEMPLATE =
  JSON.stringify(
    {
      lane: "F22",
      runtime: "pc-dashscope",
      model: "deepseek-v4.1-flash",
      base: "0000000",
      branch: "writer/F22",
      changed: ["factory/tools/example.mjs", "docs/log/f22.md"],
      verify: "node factory/tools/landingGate.mjs --sha HEAD",
      measured: "GATE PASSED",
      spendUsd: 0,
      cachedTokens: 0,
      note: "",
    },
    null,
    2,
  ) + NL;

function read(root, rel) {
  return readFileSync(join(root, rel), "utf8");
}

function json(root, rel) {
  return JSON.parse(read(root, rel));
}

function topologies(root) {
  const rt = json(root, "factory/runtimes.json");
  return (rt.topologies || []).map((t) => t.id);
}

function models(root) {
  const rt = json(root, "factory/runtimes.json");
  return (rt.catalog?.writerModel || []).map((r) => (typeof r === "string" ? r : r.id));
}

export function returnErrors(root, row) {
  const errors = [];
  if (!row || typeof row !== "object" || Array.isArray(row)) return ["not an object"];
  const known = [
    "lane",
    "runtime",
    "model",
    "base",
    "branch",
    "changed",
    "verify",
    "measured",
    "spendUsd",
    "cachedTokens",
    "note",
  ];
  const extra = Object.keys(row).filter((k) => !known.includes(k));
  if (extra.length) errors.push("unknown fields: " + extra.join(", "));

  if (typeof row.lane !== "string" || !row.lane.trim()) errors.push("lane");
  if (!topologies(root).includes(row.runtime)) {
    errors.push("runtime is not a live topology: " + row.runtime);
  }
  // Hosted ids are catalog ids or their DashScope mapping; both are named.
  if (typeof row.model !== "string" || !row.model.trim()) errors.push("model");
  if (typeof row.base !== "string" || !SHA.test(row.base)) errors.push("base is not a sha");
  if (typeof row.branch !== "string" || !row.branch.trim()) errors.push("branch");
  if (/^(main|master)$/.test(String(row.branch))) errors.push("a writer never returns main");
  if (!Array.isArray(row.changed) || !row.changed.length) errors.push("changed is empty");
  if (typeof row.spendUsd !== "number" || row.spendUsd < 0) errors.push("spendUsd");

  // The two that make a return evidence instead of a sentence.
  const verify = String(row.verify || "").trim();
  if (verify.length < 8 || !/\s/.test(verify)) {
    errors.push("verify must be the command that was run");
  }
  const measured = String(row.measured || "").trim();
  if (!measured) {
    errors.push("measured is empty — paste what the command printed, or omit the claim");
  }
  if (measured && /^(ok|done|passed|fine|works|yes)$/i.test(measured)) {
    errors.push("measured is a word, not output: " + measured);
  }
  return errors;
}

function schemaErrors(root) {
  const errors = [];
  const schema = json(root, "contracts/seat-return.v1.json");
  const live = topologies(root).slice().sort();
  const inSchema = (schema.properties?.runtime?.enum || []).slice().sort();
  if (live.join(",") !== inSchema.join(",")) {
    errors.push("contracts/seat-return.v1.json runtime enum is not factory/runtimes.json topologies");
  }
  for (const field of ["measured", "cachedTokens"]) {
    if (!schema.properties || !(field in schema.properties)) {
      errors.push("contracts/seat-return.v1.json has no " + field);
    }
  }
  if (!(schema.required || []).includes("measured")) {
    errors.push("contracts/seat-return.v1.json does not require measured");
  }
  return errors;
}

function fail(label, errors) {
  console.error(label);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

function selfTest() {
  const errors = schemaErrors(kitRoot);
  const good = JSON.parse(TEMPLATE);
  const first = returnErrors(kitRoot, good);
  if (first.length) errors.push("template should pass: " + first.join(", "));

  const cases = [
    ["no measured", { ...good, measured: "" }],
    ["a word, not output", { ...good, measured: "ok" }],
    ["no command", { ...good, verify: "tested" }],
    ["main", { ...good, branch: "main" }],
    ["dead runtime", { ...good, runtime: "desktop-deepseek" }],
    ["no files", { ...good, changed: [] }],
    ["base is not a sha", { ...good, base: "live main" }],
  ];
  for (const [name, row] of cases) {
    if (!returnErrors(kitRoot, row).length) errors.push("case passed but should fail: " + name);
  }
  if (!models(kitRoot).includes(good.model)) errors.push("template model is not in the catalog");

  if (errors.length) fail("seatReturn self-test failed", errors);
  console.log("seatReturn self-test ok");
  process.exit(0);
}

const cmd = process.argv[2];

if (cmd === "--self-test") selfTest();

if (cmd === "--template") {
  process.stdout.write(TEMPLATE);
  process.exit(0);
}

if (cmd === "--check-contract") {
  const errors = schemaErrors(kitRoot);
  if (errors.length) fail("seat-return contract failed", errors);
  console.log("seat-return contract ok");
  process.exit(0);
}

if (!cmd || cmd.startsWith("-")) {
  console.error("usage: node factory/tools/seatReturn.mjs <return.json> | --template | --check-contract | --self-test");
  process.exit(1);
}

if (!existsSync(cmd)) fail("return failed", [cmd + " not found"]);
let row;
try {
  row = JSON.parse(readFileSync(cmd, "utf8"));
} catch (err) {
  fail("return failed", [String(err.message || err)]);
}
const found = returnErrors(kitRoot, row);
if (found.length) fail("return failed", found);
console.log("return ok  " + row.lane + "  " + row.runtime + "  " + row.model);
