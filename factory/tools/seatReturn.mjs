#!/usr/bin/env node
// A return is a claim until it pastes the command and what the command
// printed. A session that says it understands still invents (S06 -> T56).
//
//   node factory/tools/seatReturn.mjs return.json
//   node factory/tools/seatReturn.mjs return.json --record --project <path>
//   node factory/tools/seatReturn.mjs spend
//   node factory/tools/seatReturn.mjs meter <project-path>
//   node factory/tools/seatReturn.mjs --template
//   node factory/tools/seatReturn.mjs --self-test
//
// A seat cannot see its own model and echoes the envelope's Runtime stamp
// instead, so the model in a return is a claim about the launcher, not a
// measurement (T69). Recording therefore reads the harness meter for the
// project the lane ran in and refuses a return whose model disagrees with
// the id that actually answered. The two ids are compared through the
// native-to-DashScope map that factory/tools/route.mjs owns, never by
// string equality: deepseek-flash and deepseek-v4.1-flash are one model
// at two vendors (T48). A project the meter has no row for is a refusal,
// not a pass — an unchecked model is the thing this refuses to store.
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
  copyFileSync,
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
// The router owns which id a base expects (T48, T75). This asks it for the
// id a model is served as instead of typing the pairs in a second copy.
import { resolve as resolveRoute } from "./route.mjs";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const SHA = /^[0-9a-f]{7,40}$/i;
const USAGE_SOURCE = "qwen usage_record.jsonl";

// One model is sold under two names and the router owns the relation (T48,
// T75), so both sides of a comparison are folded to the id the DashScope base
// expects and then compared. A second copy of the pairs here would be a second
// place for the price table to drift. The spec is read from kitRoot, never
// from the store root: a temporary store has no writer-paths.json and must not
// be asked for one.
let routeSpecCache = null;
function routeSpec() {
  if (!routeSpecCache) routeSpecCache = json(kitRoot, "factory/writer-paths.json");
  return routeSpecCache;
}

export function providerId(model) {
  return resolveRoute(
    { writerModel: String(model), writerPath: "dashscope" },
    routeSpec(),
    new Date(0),
    true,
  ).providerModel;
}

// Symmetric because both sides land on the same canonical form. An id the
// table does not list passes through unchanged and agrees only with itself.
export function sameModel(a, b) {
  return providerId(a) === providerId(b);
}

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
  return { ok: true, row: best.row, ids, totals, lines };
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
    "meterModel",
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
  // The id the harness meter recorded, when the return carries one. A seat
  // cannot see its own model, so this is not required of a seat — but a
  // present one is an id, not a sentence. The recorder cross-checks it.
  if (row.meterModel !== undefined && (typeof row.meterModel !== "string" || !row.meterModel.trim())) {
    errors.push("meterModel is not a model id");
  }
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
  for (const field of ["measured", "cachedTokens", "meterModel"]) {
    if (!schema.properties || !(field in schema.properties)) {
      errors.push("contracts/seat-return.v1.json has no " + field);
    }
  }
  if (!(schema.required || []).includes("measured")) {
    errors.push("contracts/seat-return.v1.json does not require measured");
  }
  // A seat cannot see its own model: the id is written by the recorder from
  // the meter, so requiring it would make every seat's return invalid.
  if ((schema.required || []).includes("meterModel")) {
    errors.push("contracts/seat-return.v1.json requires meterModel — a seat cannot know it");
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
  // The meter's id is a different axis from the launcher's claim, so a return
  // that carries one keys differently. A row stored before this lane has no
  // meterModel and keeps the key it was written with, which is why this is
  // appended and never substituted.
  if (row.meterModel) parts.push(String(row.meterModel));
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

// The shape of a stored row, in one place. A row is what the record kept,
// not the return it came from: prose (`changed`, `verify`, `measured`) stays
// in the lane log. A rewrite that drops a field or renames one is the
// mutation this refuses, and it refuses it on the file that ships.
const STORE_ROW_REQUIRED = ["at", "key", "lane", "runtime", "model", "base", "branch"];
const STORE_ROW_OPTIONAL = ["spendUsd", "cachedTokens", "tokens", "meterModel"];
const KEY_HEX = /^[0-9a-f]{16}$/;

export function storeErrors(root) {
  const errors = [];
  let data;
  try {
    data = loadStore(root);
  } catch (err) {
    return [STORE + " does not read: " + String(err.message || err)];
  }
  if (typeof data.rule !== "string" || !data.rule.trim()) {
    errors.push(STORE + " has no rule string");
  }
  const keys = data.rows.map((r) => r && r.key);
  if (new Set(keys).size !== keys.length) {
    errors.push(STORE + " repeats a key — the same return was counted twice");
  }
  data.rows.forEach((r, i) => {
    const where = STORE + " row " + (i + 1);
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      errors.push(where + " is not an object");
      return;
    }
    for (const f of STORE_ROW_REQUIRED) {
      if (!(f in r)) errors.push(where + " has no " + f);
    }
    const extra = Object.keys(r).filter(
      (k) => !STORE_ROW_REQUIRED.includes(k) && !STORE_ROW_OPTIONAL.includes(k),
    );
    if (extra.length) errors.push(where + " has unknown fields: " + extra.join(", "));
    if (typeof r.key !== "string" || !KEY_HEX.test(r.key)) errors.push(where + " key is not a content key");
    if (typeof r.at !== "string" || Number.isNaN(Date.parse(r.at))) errors.push(where + " at is not a time");
    if (typeof r.lane !== "string" || !r.lane.trim()) errors.push(where + " lane is not a lane id");
    if (typeof r.runtime !== "string" || !r.runtime.trim()) {
      errors.push(where + " runtime is not a runtime id");
    }
    if (typeof r.model !== "string" || !r.model.trim()) errors.push(where + " model is not a model id");
    if (typeof r.base !== "string" || !SHA.test(r.base)) errors.push(where + " base is not a sha");
    if (
      r.spendUsd !== undefined &&
      (typeof r.spendUsd !== "number" || !Number.isFinite(r.spendUsd) || r.spendUsd < 0)
    ) {
      errors.push(where + " spendUsd is not a non-negative number");
    }
    if (r.meterModel !== undefined && (typeof r.meterModel !== "string" || !r.meterModel.trim())) {
      errors.push(where + " meterModel is not a model id");
    }
    if (r.tokens !== undefined) {
      const t = r.tokens;
      if (!t || typeof t !== "object" || Array.isArray(t)) {
        errors.push(where + " tokens is not an object");
      } else {
        for (const f of ["in", "out", "cached", "requests"]) {
          if (typeof t[f] !== "number" || !Number.isFinite(t[f]) || t[f] < 0) {
            errors.push(where + " tokens." + f + " is not a non-negative number");
          }
        }
        if (typeof t.source !== "string" || !t.source.trim()) {
          errors.push(where + " tokens.source is empty");
        }
      }
    }
  });
  return errors;
}

export function record(root, row, project, meterFile = usageRecordPath()) {
  const data = loadStore(root);
  const key = rowKey(row);
  if (data.rows.some((r) => r.key === key)) {
    return { ok: false, key, reason: "already recorded" };
  }

  // T69. The model in a return is a claim about the launcher: the seat cannot
  // see its own model and echoes the envelope's Runtime stamp instead. What
  // the seat cannot do is check that claim, so the recorder does, against the
  // id the harness meter recorded for the project the lane ran in. No meter
  // row at all is a refusal and not a pass — a claim nobody measured is the
  // thing this refuses to store.
  const meter = readMeter(meterFile, project);
  if (!meter.ok) {
    return { ok: false, key: null, reason: "no meter for " + String(project || "the project") + ": " + meter.reason };
  }
  const agreed = meter.ids.find((id) => sameModel(id, row.model));
  if (!agreed) {
    return {
      ok: false,
      key: null,
      reason:
        "model disagreement: the return says " + row.model +
        ", the meter recorded " + meter.ids.join(", "),
    };
  }
  if (row.meterModel !== undefined && !sameModel(row.meterModel, agreed)) {
    return {
      ok: false,
      key: null,
      reason:
        "meterModel disagreement: the return declares " + row.meterModel +
        ", the meter recorded " + agreed,
    };
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
  // Both ids on the row: the launcher's claim and the meter's answer. The
  // relation between them is not stable over time — an unversioned id sent to
  // the DashScope base is a different price (T48) — so a later price question
  // has to be able to see which id was actually served, not just that the two
  // folded together on the day they were compared.
  stored.meterModel = agreed;
  data.rows.push(stored);
  saveStore(root, data);
  return { ok: true, key, rows: data.rows.length, meterModel: agreed };
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

  // Recording reads the meter for the project the lane ran in, so every
  // record below needs a project the record file has a row for. The row names
  // the model under the other vendor's id on purpose: the return claims
  // deepseek-v4.1-flash, the meter says deepseek-flash, and the router's map
  // is what makes that an agreement instead of a refusal (T48).
  const meterDir = mkdtempSync(join(tmpdir(), "seat-return-project-"));
  const meterFile = join(meterDir, "usage_record.jsonl");
  const project = "C:\\proj\\f38";
  const counts = (requests, inputTokens, outputTokens, cachedTokens) => ({
    requests,
    inputTokens,
    outputTokens,
    cachedTokens,
  });
  writeFileSync(
    meterFile,
    JSON.stringify({
      sessionId: "f38",
      timestamp: 10,
      project,
      models: { "deepseek-flash": counts(3, 30, 6, 9) },
    }) + NL,
  );

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
    ["meterModel is a sentence", { ...good, meterModel: "  " }],
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
    if (!record(dir, good, project, meterFile).ok) errors.push("first record refused");
    if (record(dir, good, project, meterFile).ok) errors.push("the same return was recorded twice");
    const other = { ...good, lane: "F99", spendUsd: 0.25, cachedTokens: 1000 };
    if (!record(dir, other, project, meterFile).ok) errors.push("a different return was refused");
    const rows = loadStore(dir).rows;
    if (rows.length !== 2) errors.push("store has " + rows.length + " rows, expected 2");
    if (rows.some((r) => !r.key || !r.at)) errors.push("a row is missing its key or its time");
    if (rows.some((r) => "measured" in r || "changed" in r)) {
      errors.push("the store keeps rows; prose belongs in the lane log");
    }
    if (rows.some((r) => r.meterModel !== "deepseek-flash")) {
      errors.push("the row did not keep the id the meter recorded");
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
    if (!record(dir2, metered, project, meterFile).ok) errors.push("a metered return was refused by the store");
    if (record(dir2, metered, project, meterFile).ok) errors.push("the same metered return was recorded twice");
    const rows = loadStore(dir2).rows;
    if (rows.length !== 1) errors.push("metered store has " + rows.length + " rows");
    // Guarded: a refusal upstream leaves no row, and reading rows[0].tokens
    // then would crash the test instead of reporting what went wrong.
    if (rows.length && !rows[0].tokens) errors.push("the store dropped the tokens block");
    if (rows.length && "spendUsd" in rows[0]) errors.push("the store invented a dollar for a metered row");
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
      if (hit.ids.join(",") !== "deepseek-flash,qwen3-coder-plus") {
        errors.push("meter did not report which ids answered: " + hit.ids.join(","));
      }
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

  // One model is sold under two names, and the router owns the pairs (T48,
  // T75). The relation lives in factory/tools/route.mjs; what is written here
  // is the expectation, so that a comparison by raw string — which would call
  // every one of these three a disagreement — fails this test.
  const pairs = [
    ["deepseek-flash", "deepseek-v4.1-flash"],
    ["deepseek-v4-pro", "deepseek-v4-pro-0813"],
    ["qwen3-coder", "qwen3-coder-plus"],
  ];
  for (const [a, b] of pairs) {
    if (a === b) errors.push("a pair is not a pair: " + a);
    if (!sameModel(a, b)) errors.push("the router's map does not fold " + a + " and " + b);
    if (providerId(a) !== providerId(b)) errors.push(a + " and " + b + " fold to different ids");
    if (a === providerId(a)) errors.push(a + " was not remapped — the map is not being asked");
  }
  if (!sameModel("deepseek-flash", "deepseek-flash")) errors.push("an id does not fold to itself");
  if (sameModel("deepseek-flash", "deepseek-v4-pro")) errors.push("two different models folded as one");
  if (sameModel("qwen3.7-flash", "qwen3.8-max")) errors.push("two different models folded as one");

  // T69, both halves. The return claims a model; the meter answers with the
  // id that actually answered; and a project the meter has no row for is a
  // refusal rather than a pass. The claim and the answer below are one model
  // at two vendors, so only the router's map finds the agreement.
  const dir4 = mkdtempSync(join(tmpdir(), "seat-return-t69-"));
  try {
    const agrees = { ...good, lane: "F38" };
    const out = record(dir4, agrees, project, meterFile);
    if (!out.ok) {
      errors.push("a return that agrees with the meter was refused: " + out.reason);
    } else if (out.meterModel !== "deepseek-flash") {
      errors.push("the row names " + out.meterModel + ", not the id the meter recorded");
    }
    if (record(dir4, agrees, project, meterFile).ok) errors.push("the same return doubled its row");
    if (loadStore(dir4).rows.length !== 1) {
      errors.push("the store holds " + loadStore(dir4).rows.length + " rows after one return and one re-record");
    }

    const wrong = { ...good, lane: "F38", model: "qwen3.7-flash" };
    const refused = record(dir4, wrong, project, meterFile);
    if (refused.ok) errors.push("a return whose model disagrees with the meter was recorded");
    else if (!refused.reason.includes("qwen3.7-flash") || !refused.reason.includes("deepseek-flash")) {
      errors.push("the refusal did not name both ids: " + refused.reason);
    }
    if (loadStore(dir4).rows.length !== 1) {
      errors.push("a refusal changed the store's row count: " + loadStore(dir4).rows.length);
    }

    const declared = { ...good, lane: "F38", meterModel: "qwen3.7-flash" };
    if (record(dir4, declared, project, meterFile).ok) {
      errors.push("a return that declared the wrong meterModel was recorded");
    }

    const unmetered = record(dir4, { ...good, lane: "F41" }, "C:/proj/nobody", meterFile);
    if (unmetered.ok) errors.push("a project with no meter row was recorded anyway");
    else if (!/^no meter/.test(unmetered.reason)) {
      errors.push("a missing meter did not say so: " + unmetered.reason);
    }
    if (loadStore(dir4).rows.length !== 1) {
      errors.push("an unmetered refusal changed the row count: " + loadStore(dir4).rows.length);
    }
  } finally {
    rmSync(dir4, { recursive: true, force: true });
  }

  // The store that ships. Its rows are the only real measurement this factory
  // has, so its shape is checked here: the gate step that runs this file is
  // then the check that catches a rewrite (D-59, T65).
  const shipped = loadStore(kitRoot);
  for (const e of storeErrors(kitRoot)) errors.push("live store: " + e);
  const dir5 = mkdtempSync(join(tmpdir(), "seat-return-shape-"));
  try {
    const copy = join(dir5, STORE);
    mkdirSync(dirname(copy), { recursive: true });
    const write = (data) => writeFileSync(copy, JSON.stringify(data, null, 2) + NL);
    write(shipped);
    if (storeErrors(dir5).length) {
      errors.push("a faithful copy of the shipped store failed: " + storeErrors(dir5).join("; "));
    }
    if (!shipped.rows.length) {
      errors.push("the store shipped with no rows — this check would prove nothing");
    } else {
      const bent = JSON.parse(JSON.stringify(shipped));
      delete bent.rows[0].branch;
      write(bent);
      if (!storeErrors(dir5).length) errors.push("a stored row that lost its branch passed");
      const bent2 = JSON.parse(JSON.stringify(shipped));
      bent2.rows[0].key = "not-a-key";
      write(bent2);
      if (!storeErrors(dir5).length) errors.push("a stored row with a broken key passed");
      const bent3 = JSON.parse(JSON.stringify(shipped));
      bent3.rows[0].modelId = bent3.rows[0].model;
      delete bent3.rows[0].model;
      write(bent3);
      const joined = storeErrors(dir5).join("; ");
      if (!/unknown fields: modelId/.test(joined) || !/has no model/.test(joined)) {
        errors.push("a renamed field was not caught: " + (joined || "no error at all"));
      }
      const bent4 = JSON.parse(JSON.stringify(shipped));
      bent4.rows[0].lane = "  ";
      write(bent4);
      const blank = storeErrors(dir5).join("; ");
      if (!/lane is not a lane id/.test(blank)) {
        errors.push("a stored row with a blank lane was not caught: " + (blank || "no error at all"));
      }
    }
  } finally {
    rmSync(dir5, { recursive: true, force: true });
  }

  // The contract that ships is checked by --check-contract, which no gate step
  // runs. This is the gate's copy of that check, so loosening a required field
  // to make a disagreement pass is red where the landings look.
  const dir6 = mkdtempSync(join(tmpdir(), "seat-return-contract-"));
  try {
    mkdirSync(join(dir6, "contracts"), { recursive: true });
    mkdirSync(join(dir6, "factory"), { recursive: true });
    const contract = join(dir6, "contracts/seat-return.v1.json");
    copyFileSync(join(kitRoot, "contracts/seat-return.v1.json"), contract);
    copyFileSync(join(kitRoot, "factory/runtimes.json"), join(dir6, "factory/runtimes.json"));
    if (schemaErrors(dir6).length) {
      errors.push("a faithful copy of the contract failed: " + schemaErrors(dir6).join("; "));
    }
    const straight = json(dir6, "contracts/seat-return.v1.json");
    const bent = JSON.parse(JSON.stringify(straight));
    bent.required = (bent.required || []).filter((f) => f !== "measured");
    writeFileSync(contract, JSON.stringify(bent, null, 2) + NL);
    if (!schemaErrors(dir6).length) errors.push("a contract that stopped requiring measured passed");
    const bent2 = JSON.parse(JSON.stringify(straight));
    bent2.required = [...(bent2.required || []), "meterModel"];
    writeFileSync(contract, JSON.stringify(bent2, null, 2) + NL);
    if (!schemaErrors(dir6).length) {
      errors.push("a contract that requires a seat to know its own meterModel passed");
    }
  } finally {
    rmSync(dir6, { recursive: true, force: true });
  }

  rmSync(meterDir, { recursive: true, force: true });

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
  const errors = [...schemaErrors(kitRoot), ...storeErrors(kitRoot)];
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
    "usage: node factory/tools/seatReturn.mjs <return.json> [--record --project <path>] | spend | meter <project-path> | --template | --check-contract | --self-test",
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
  // The project is not optional. A return is recorded only against the meter
  // row of the project its lane ran in, and guessing that path would defeat
  // the check it is there to make (T69).
  const at = process.argv.indexOf("--project");
  const project = at > -1 ? process.argv[at + 1] : null;
  if (!project || project.startsWith("--")) {
    fail("record refused", ["--record needs --project <path>; a model nobody measured is not stored"]);
  }
  const out = record(storeRoot(), row, project);
  if (!out.ok) fail("record refused", [out.reason + (out.key ? ": " + out.key : "")]);
  console.log("recorded " + out.key + "  rows " + out.rows + "  meter says " + out.meterModel);
}
process.exit(0);
