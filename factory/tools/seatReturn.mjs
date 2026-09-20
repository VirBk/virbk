#!/usr/bin/env node
// A return is a claim until it pastes the command and what the command
// printed. A session that says it understands still invents (S06 -> T56).
//
//   node factory/tools/seatReturn.mjs return.json
//   node factory/tools/seatReturn.mjs return.json --record
//   node factory/tools/seatReturn.mjs spend
//   node factory/tools/seatReturn.mjs meter <project-path>
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
//
// A dollar is not a measurement the meter can make. The usage record
// carries tokens and no cost, so spendUsd is required unless a tokens
// block names the meter its numbers were pasted from; a zero there would
// be a durable false measurement in the store (F32).

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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const SHA = /^[0-9a-f]{7,40}$/i;
const USAGE_SOURCE = "qwen usage_record.jsonl";

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

// The meter. qwen-code writes one line per session when the session
// closes, keyed by the project root it ran in. meter reads that file and
// nothing else: read-only, no network, no file written. A number it
// prints is a paste of what the harness recorded, never a computation.

function usageRecordPath() {
  if (process.env.SEAT_USAGE_RECORD) return resolve(process.env.SEAT_USAGE_RECORD);
  const home = process.platform === "win32"
    ? process.env.USERPROFILE || process.env.HOME
    : process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  return join(home, ".qwen", "usage_record.jsonl");
}

// A Windows record stores C:\a\b, and a seat may be handed C:/a/b.
// Separators fold only when one side carries a backslash; case folds only
// on Windows, where the filesystem does.
export function sameProject(a, b) {
  const fold = (s) =>
    String(s ?? "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
  let x = fold(a);
  let y = fold(b);
  if (process.platform === "win32") {
    x = x.toLowerCase();
    y = y.toLowerCase();
  }
  return x.length > 0 && x === y;
}

function rate(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

export function readMeter(file, projectPath) {
  if (!file) return { ok: false, reason: "no home directory — set USERPROFILE or HOME" };
  if (!existsSync(file)) return { ok: false, reason: "no usage record at " + file };
  const project = String(projectPath || "").trim();
  if (!project) return { ok: false, reason: "meter needs a project path" };
  let best = null;
  let rows = 0;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue; // one unreadable line is not a reason to invent the rest
    }
    if (!row || typeof row !== "object") continue;
    rows += 1;
    // The record holds every project. Match exactly, and take the newest
    // session for that project: the last line belongs to whoever ran last.
    if (!sameProject(row.project, project)) continue;
    const at = rate(row.timestamp);
    if (!best || at > best.at) best = { at, row };
  }
  if (!best) {
    return {
      ok: false,
      reason: "no session in " + file + " has project " + project + " (" + rows + " rows read)",
    };
  }
  const byId = best.row.models && typeof best.row.models === "object" ? best.row.models : {};
  const ids = Object.keys(byId);
  if (!ids.length) {
    return { ok: false, reason: "session " + best.row.sessionId + " has no model entries" };
  }
  const totals = { requests: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  let fields = 0;
  for (const id of ids) {
    const m = byId[id] || {};
    for (const k of Object.keys(totals)) {
      if (typeof m[k] === "number" && Number.isFinite(m[k]) && m[k] >= 0) {
        totals[k] += m[k];
        fields += 1;
      }
    }
  }
  if (!fields) {
    return { ok: false, reason: "session " + best.row.sessionId + " carries no token numbers" };
  }
  const lines = [
    "source " + USAGE_SOURCE,
    "file " + file,
    "session " + best.row.sessionId,
    "project " + best.row.project,
    "models " + ids.join(","),
    "requests " + totals.requests,
    "inputTokens " + totals.inputTokens,
    "outputTokens " + totals.outputTokens,
    "cachedTokens " + totals.cachedTokens,
  ];
  return { ok: true, row: best.row, totals, lines };
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
    "tokens",
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

  // The meter made a dollar optional, and only the meter can. A tokens
  // block whose source is empty names nothing, so spendUsd is required
  // again: a word in that field is worse than an absent one.
  let metered = false;
  if (row.tokens !== undefined) {
    const t = row.tokens;
    if (!t || typeof t !== "object" || Array.isArray(t)) {
      errors.push("tokens is not an object");
    } else {
      for (const f of ["in", "out", "cached", "requests"]) {
        if (typeof t[f] !== "number" || !Number.isFinite(t[f]) || t[f] < 0) {
          errors.push("tokens." + f + " is not a non-negative number");
        }
      }
      if (typeof t.source !== "string" || !t.source.trim()) {
        errors.push("tokens.source is empty — name the meter the numbers came from");
      } else {
        metered = true;
      }
    }
  }
  if (row.spendUsd === undefined) {
    if (!metered) errors.push("spendUsd is required unless tokens.source names the meter");
  } else if (typeof row.spendUsd !== "number" || !Number.isFinite(row.spendUsd) || row.spendUsd < 0) {
    errors.push("spendUsd");
  }

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
  if (!schema.properties?.tokens) {
    errors.push("contracts/seat-return.v1.json has no tokens");
  }
  if ((schema.required || []).includes("spendUsd")) {
    errors.push("contracts/seat-return.v1.json requires spendUsd — the meter made it conditional");
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
// A tokens block is part of what was done, so it is part of the key; a
// return without one keys exactly as it did before the meter existed.
export function rowKey(row) {
  const parts = [
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
  ];
  if (row.tokens) {
    parts.push(
      String(row.tokens.in),
      String(row.tokens.out),
      String(row.tokens.cached),
      String(row.tokens.requests),
      String(row.tokens.source),
    );
  }
  return createHash("sha256").update(parts.join(String.fromCharCode(31))).digest("hex").slice(0, 16);
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
  const stored = {
    at: new Date().toISOString(),
    key,
    lane: row.lane,
    runtime: row.runtime,
    model: row.model,
    base: row.base,
    branch: row.branch,
  };
  // A metered return has no dollar to store. Storing a zero would be a
  // false measurement that outlives the seat.
  if (typeof row.spendUsd === "number") stored.spendUsd = row.spendUsd;
  if (row.tokens) {
    stored.tokens = row.tokens;
  } else {
    stored.cachedTokens = typeof row.cachedTokens === "number" ? row.cachedTokens : 0;
  }
  data.rows.push(stored);
  saveStore(root, data);
  return { ok: true, key, rows: data.rows.length };
}

function usd(n) {
  return "$" + n.toFixed(4);
}

function cachedOf(r) {
  if (r.tokens) return Number(r.tokens.cached) || 0;
  return Number(r.cachedTokens) || 0;
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
  let unpriced = 0;
  const metered = { rows: 0, in: 0, out: 0, cached: 0, requests: 0 };
  for (const r of rows) {
    const s = Number(r.spendUsd) || 0;
    const c = cachedOf(r);
    if (typeof r.spendUsd !== "number") unpriced += 1;
    spend += s;
    cached += c;
    if (r.tokens) {
      metered.rows += 1;
      metered.in += Number(r.tokens.in) || 0;
      metered.out += Number(r.tokens.out) || 0;
      metered.cached += Number(r.tokens.cached) || 0;
      metered.requests += Number(r.tokens.requests) || 0;
    }
    for (const [map, k] of [[byLane, r.lane], [byModel, r.model]]) {
      const cur = map.get(k) || { rows: 0, spendUsd: 0, cachedTokens: 0 };
      cur.rows += 1;
      cur.spendUsd += s;
      cur.cachedTokens += c;
      map.set(k, cur);
    }
  }
  const lines = [
    "returns " + rows.length + "  spend " + usd(spend) + "  cached tokens " + cached +
      (unpriced ? "  unpriced " + unpriced : ""),
    "",
  ];
  if (metered.rows) {
    lines.push(
      "metered rows " + metered.rows + "  in " + metered.in + "  out " + metered.out +
        "  cached " + metered.cached + "  requests " + metered.requests,
      "",
    );
  }
  lines.push("by lane");
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

  const strip = (o, keys) => {
    const c = { ...o };
    for (const k of keys) delete c[k];
    return c;
  };
  const metered = {
    ...strip(good, ["spendUsd"]),
    tokens: { in: 120, out: 30, cached: 80, requests: 2, source: "qwen usage_record.jsonl" },
  };

  const cases = [
    ["no measured", { ...good, measured: "" }],
    ["a word, not output", { ...good, measured: "ok" }],
    ["no command", { ...good, verify: "tested" }],
    ["main", { ...good, branch: "main" }],
    ["dead runtime", { ...good, runtime: "desktop-deepseek" }],
    ["no files", { ...good, changed: [] }],
    ["base is not a sha", { ...good, base: "live main" }],
    ["spendUsd is a word", { ...good, spendUsd: "cheap" }],
    // The meter made spendUsd optional, not absent: without a named meter
    // the dollar is still required, and a meter needs a source.
    ["neither spendUsd nor tokens", strip(good, ["spendUsd"])],
    ["tokens without a source", { ...strip(good, ["spendUsd"]), tokens: { ...metered.tokens, source: "" } }],
    ["tokens with a negative count", { ...strip(good, ["spendUsd"]), tokens: { ...metered.tokens, cached: -1 } }],
    ["tokens is not an object", { ...strip(good, ["spendUsd"]), tokens: 4 }],
  ];
  for (const [name, row] of cases) {
    if (!returnErrors(kitRoot, row).length) errors.push("case passed but should fail: " + name);
  }
  const meteredErrors = returnErrors(kitRoot, metered);
  if (meteredErrors.length) {
    errors.push("a metered return with no spendUsd should pass: " + meteredErrors.join(", "));
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

  // A metered row round-trips through spend: the numbers survive the
  // store, and no dollar is invented for a return that has none.
  const dir2 = mkdtempSync(join(tmpdir(), "seat-return-metered-"));
  try {
    if (!record(dir2, metered).ok) errors.push("a metered return was refused by the store");
    if (record(dir2, metered).ok) errors.push("the same metered return was recorded twice");
    const rows = loadStore(dir2).rows;
    if (rows.length !== 1) errors.push("metered store has " + rows.length + " rows");
    if (!rows[0].tokens) errors.push("the store dropped the tokens block");
    if ("spendUsd" in rows[0]) errors.push("the store invented a dollar for a metered row");
    const report = spendReport(dir2);
    if (!/metered rows 1 {2}in 120 {2}out 30 {2}cached 80 {2}requests 2/.test(report)) {
      errors.push("spend did not read the metered row back:\n" + report);
    }
    if (!/unpriced 1/.test(report)) errors.push("spend hid that a row carries no dollar");
  } finally {
    rmSync(dir2, { recursive: true, force: true });
  }

  // The meter reads the record for one project. The last line of a record
  // belongs to whoever ran last, not to the project being asked about.
  const dir3 = mkdtempSync(join(tmpdir(), "seat-return-meter-"));
  try {
    const rec = join(dir3, "usage_record.jsonl");
    const tokens = (requests, inputTokens, outputTokens, cachedTokens) => ({
      requests,
      inputTokens,
      outputTokens,
      cachedTokens,
    });
    const fixture = [
      { sessionId: "new", timestamp: 200, project: "c:/proj/a", models: { "deepseek-flash": tokens(4, 40, 8, 12), "qwen3-coder-plus": tokens(6, 60, 9, 0) } },
      { sessionId: "old", timestamp: 100, project: "c:/proj/a", models: { "deepseek-flash": tokens(1, 10, 2, 3) } },
      { sessionId: "other", timestamp: 300, project: "c:/proj/b", models: { "deepseek-flash": tokens(99, 999, 999, 999) } },
    ];
    writeFileSync(rec, fixture.map((r) => JSON.stringify(r)).join(NL) + NL + "not json" + NL);
    const hit = readMeter(rec, "c:/proj/a");
    if (!hit.ok) {
      errors.push("meter missed a project in the record: " + hit.reason);
    } else {
      const t = hit.totals;
      if (t.requests !== 10 || t.inputTokens !== 100 || t.outputTokens !== 17 || t.cachedTokens !== 12) {
        errors.push("meter took the wrong session or summed wrong: " + JSON.stringify(t));
      }
      if (hit.row.sessionId !== "new") {
        errors.push("meter took the last line, not the newest session: " + hit.row.sessionId);
      }
      if (!hit.lines.includes("file " + rec)) errors.push("meter did not print the file it read");
      if (!hit.lines.includes("source " + USAGE_SOURCE)) errors.push("meter did not name its source");
    }
    if (readMeter(rec, "c:/proj/c").ok) errors.push("meter matched a project that is not in the record");
    if (readMeter(join(dir3, "absent.jsonl"), "c:/proj/a").ok) {
      errors.push("meter read a file that does not exist");
    }
    if (readMeter(rec, "  ").ok) errors.push("meter needs a project path");
    if (process.platform === "win32" && !sameProject("C:\\proj\\a", "c:/proj/a")) {
      errors.push("meter does not fold separators on windows");
    }
    if (sameProject("c:/proj/a/", "c:/proj/ab")) errors.push("meter folded two different projects");
  } finally {
    rmSync(dir3, { recursive: true, force: true });
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

if (cmd === "meter") {
  const out = readMeter(usageRecordPath(), process.argv[3]);
  if (!out.ok) {
    console.log("meter: " + out.reason);
    process.exit(1);
  }
  process.stdout.write(out.lines.join(NL) + NL);
  process.exit(0);
}

if (!cmd || cmd.startsWith("-")) {
  console.error(
    "usage: node factory/tools/seatReturn.mjs <return.json> [--record] | spend | meter <project-path> | --template | --check-contract | --self-test",
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
