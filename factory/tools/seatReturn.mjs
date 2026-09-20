#!/usr/bin/env node
// A return is a claim until it pastes the command and what the command
// printed. A session that says it understands still invents (S06 -> T56).
//
//   node factory/tools/seatReturn.mjs return.json
//   node factory/tools/seatReturn.mjs return.json --record
//   node factory/tools/seatReturn.mjs spend
//   node factory/tools/seatReturn.mjs --template
//   node factory/tools/seatReturn.mjs --self-test
//
// The runtime is checked against the live catalog, not against a list
// typed into the schema once: factory/runtimes.json is the catalog and
// contracts/seat-return.v1.json must agree with it.
//
// A number that is validated and then discarded is not a dataset. The
// lane log keeps the prose; factory/returns.json keeps the rows, and the
// rows outlive the twelve-row ledger window (S07 -> T65).

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
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

// The store. Rows outlive the ledger window, which is twelve rows wide.
// Appended only here, only after the return passed the same validation,
// and read only by `spend`. It is not in the packet: no seat reads it.

const STORE = "factory/returns.json";
const STORE_RULE =
  "Rows appended by node factory/tools/seatReturn.mjs <return.json> --record, " +
  "read by node factory/tools/seatReturn.mjs spend. One row per accepted return, " +
  "keyed by its content so the same return is not counted twice. The lane log keeps " +
  "the prose. Not the reading path: no seat reads this file.";

function storeRoot() {
  return process.env.SEAT_RETURN_ROOT || kitRoot;
}

// The key names the thing done and is checked read-first, so an
// at-least-once record does not double the spend (AGENTS section 6).
export function rowKey(row) {
  const canonical = [
    row.lane,
    row.runtime,
    row.model,
    row.base,
    row.branch,
    (row.changed || []).join(","),
    row.verify,
    row.measured,
    String(row.spendUsd),
    String(row.cachedTokens || 0),
  ].join(String.fromCharCode(31));
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function loadStore(root) {
  const p = join(root, STORE);
  if (!existsSync(p)) return { rule: STORE_RULE, rows: [] };
  const data = JSON.parse(readFileSync(p, "utf8"));
  if (!Array.isArray(data.rows)) throw new Error(STORE + " has no rows array");
  return data;
}

function saveStore(root, data) {
  mkdirSync(join(root, "factory"), { recursive: true });
  writeFileSync(join(root, STORE), JSON.stringify(data, null, 2) + NL);
}

export function record(root, row) {
  const data = loadStore(root);
  const key = rowKey(row);
  if (data.rows.some((r) => r.key === key)) {
    return { ok: false, key, reason: "already recorded" };
  }
  data.rows.push({
    at: new Date().toISOString(),
    key,
    lane: row.lane,
    runtime: row.runtime,
    model: row.model,
    base: row.base,
    branch: row.branch,
    spendUsd: row.spendUsd,
    cachedTokens: typeof row.cachedTokens === "number" ? row.cachedTokens : 0,
  });
  saveStore(root, data);
  return { ok: true, key, rows: data.rows.length };
}

function usd(n) {
  return "$" + n.toFixed(4);
}

export function spendReport(root) {
  const rows = loadStore(root).rows;
  if (!rows.length) {
    return "no returns recorded" + NL +
      "  node factory/tools/seatReturn.mjs <return.json> --record" + NL;
  }
  const byLane = new Map();
  const byModel = new Map();
  let spend = 0;
  let cached = 0;
  for (const r of rows) {
    const s = Number(r.spendUsd) || 0;
    const c = Number(r.cachedTokens) || 0;
    spend += s;
    cached += c;
    for (const [map, k] of [[byLane, r.lane], [byModel, r.model]]) {
      const cur = map.get(k) || { rows: 0, spendUsd: 0, cachedTokens: 0 };
      cur.rows += 1;
      cur.spendUsd += s;
      cur.cachedTokens += c;
      map.set(k, cur);
    }
  }
  const lines = [
    "returns " + rows.length + "  spend " + usd(spend) + "  cached tokens " + cached,
    "",
    "by lane",
  ];
  const row = (k, v, width) =>
    "  " + String(k).padEnd(width) + String(v.rows).padStart(3) + "  " +
    usd(v.spendUsd).padStart(11) + "  " + String(v.cachedTokens).padStart(9) + " cached";
  for (const [k, v] of [...byLane].sort()) lines.push(row(k, v, 10));
  lines.push("", "by model");
  for (const [k, v] of [...byModel].sort()) lines.push(row(k, v, 24));
  return lines.join(NL) + NL;
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

  // The store: a row survives, a re-record is refused, spend sums rows.
  const dir = mkdtempSync(join(tmpdir(), "seat-return-"));
  try {
    if (!record(dir, good).ok) errors.push("first record refused");
    if (record(dir, good).ok) errors.push("the same return was recorded twice");
    const other = { ...good, lane: "F99", spendUsd: 0.25, cachedTokens: 1000 };
    if (!record(dir, other).ok) errors.push("a different return was refused");
    const rows = loadStore(dir).rows;
    if (rows.length !== 2) errors.push("store has " + rows.length + " rows, expected 2");
    if (rows.some((r) => !r.key || !r.at)) errors.push("a row is missing its key or its time");
    if (rows.some((r) => "measured" in r || "changed" in r)) {
      errors.push("the store keeps rows; prose belongs in the lane log");
    }
    const report = spendReport(dir);
    if (!/returns 2/.test(report)) errors.push("spend did not count both rows");
    if (!/F99/.test(report)) errors.push("spend lost a lane");
    if (!/\$0\.2500/.test(report)) errors.push("spend lost the number");
    if (!/1000 cached/.test(report)) errors.push("spend lost cached tokens");
    const empty = mkdtempSync(join(tmpdir(), "seat-return-empty-"));
    try {
      if (!/no returns recorded/.test(spendReport(empty))) {
        errors.push("an empty store must say so, not crash");
      }
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

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

if (cmd === "spend") {
  process.stdout.write(spendReport(storeRoot()));
  process.exit(0);
}

if (!cmd || cmd.startsWith("-")) {
  console.error(
    "usage: node factory/tools/seatReturn.mjs <return.json> [--record] | spend | --template | --check-contract | --self-test",
  );
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

// A return that fails validation is never recorded: the check is above.
if (process.argv.includes("--record")) {
  const out = record(storeRoot(), row);
  if (!out.ok) fail("record refused", [out.reason + ": " + out.key]);
  console.log("recorded " + out.key + "  rows " + out.rows);
}
process.exit(0);
