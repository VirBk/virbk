#!/usr/bin/env node
// Dumb writer-path router. No model. No API keys.
//
//   node factory/tools/route.mjs resolve
//   node factory/tools/route.mjs peak
//   node factory/tools/route.mjs probe
//   node factory/tools/route.mjs check-dropped
//   node factory/tools/route.mjs --self-test
//
// Clock: ROUTE_NOW=2026-09-18T07:00:00Z
// Native health (resolve only): ROUTE_NATIVE=up|down
//
// The answer is one object: path, reason, base, key NAME and the model id that
// base expects. A second caller asks for it instead of keeping its own copy of
// any of the five (T29, T48); `resolveNow` is the whole resolve branch, and
// the CLI below is one caller of it, not the resolver.
//
// An id in neither the catalog nor the hosted map has no family, so it is
// refused by name and the CLI exits non-zero (D-71). A family comes from the
// catalog, not from a prefix of the id.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const NL = String.fromCharCode(10);
const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

// `--root <tree>` points a read at a tree other than this one; that is how a
// fixture drives the exact command the gate runs, on the object that ships,
// rather than a helper called beside it (F50).
function parseArgs(argv) {
  const rest = [];
  let tree = kitRoot;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1]) {
      tree = resolvePath(argv[i + 1]);
      i++;
      continue;
    }
    rest.push(argv[i]);
  }
  return { root: tree, rest };
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function project(tree = root) {
  return loadJson(join(tree, "factory/project.json"));
}

function pathsSpec(tree = root) {
  return loadJson(join(tree, "factory/writer-paths.json"));
}

// The catalog names every id this factory writes with (D-68). It is read,
// never copied: an id the catalog does not offer is not offered by a tool
// here. A tree without the file — a fixture that copies only the files it
// drives — names no catalog rather than throwing.
export function catalogIds(tree = root) {
  const file = join(tree, "factory", "runtimes.json");
  if (!existsSync(file)) return [];
  try {
    const cat = (loadJson(file).catalog || {}).writerModel;
    if (!Array.isArray(cat)) return [];
    return cat
      .map((row) => (row && typeof row === "object" ? row.id : row))
      .filter((id) => typeof id === "string" && id);
  } catch {
    return [];
  }
}

// The ids the router will answer about: the catalog's, and the two ends of the
// hosted map — an already-hosted id is not remapped twice, so it must still be
// recognised. An id at neither is unrecognised (D-71), including an id that
// merely looks like a family the catalog no longer has.
function knownIds(tree = root) {
  const out = new Set();
  for (const id of Object.keys(HOSTED_IDS)) out.add(id);
  for (const id of Object.values(HOSTED_IDS)) out.add(id);
  for (const id of catalogIds(tree)) out.add(id);
  return out;
}

// The dropped list is a read, not a copy (T29, T75). It is the list the check
// examines, so a second list cannot be substituted for it.
export function droppedIds(tree = root) {
  try {
    const spec = loadJson(join(tree, "factory/writer-paths.json"));
    const ids = spec.dropped && spec.dropped.ids;
    return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// P3 — the check examines a list it did not write, and reports how many ids it
// examined. An empty list FAILS: a pass there cannot be told from a check that
// never ran (F49). An id is compared as a whole token, so a dropped id that is
// a prefix of a live one is not reported inside it.
const ID_SEPARATORS = /[^A-Za-z0-9._-]+/;
function tokensOf(text) {
  return String(text == null ? "" : text).split(ID_SEPARATORS).filter(Boolean);
}

export function droppedAudit(objects, ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
  if (!list.length) {
    return {
      status: "empty",
      examined: 0,
      lines: ["dropped-audit: examined 0 id(s) - the dropped list is empty, so this check examined nothing"],
    };
  }
  const lines = [];
  for (const obj of objects || []) {
    const seen = new Set(tokensOf(obj && obj.text));
    for (const id of list) {
      if (seen.has(id)) lines.push((obj.label || "surface") + " carries dropped id " + id);
    }
  }
  return { status: lines.length ? "dirty" : "clean", examined: list.length, lines };
}

// The surfaces a seat or a launcher reads for a model id: the hosted map's two
// ends and the catalog.
function shippedSurfaces(tree = root) {
  return [
    { label: "HOSTED_IDS", text: Object.keys(HOSTED_IDS).join(NL) },
    { label: "HOSTED_IDS values", text: Object.values(HOSTED_IDS).join(NL) },
    { label: "runtimes.json catalog", text: catalogIds(tree).join(NL) },
  ];
}

function parseHHMM(s) {
  const [h, m] = s.split(":").map((n) => Number(n));
  return h * 60 + m;
}

function isPeakAt(date, spec) {
  const day = date.getUTCDay();
  if (!(spec.peak.weekdays || []).includes(day)) return false;
  const mins = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (spec.peak.windowsUtc || []).some(([a, b]) => {
    const start = parseHHMM(a);
    const end = parseHHMM(b);
    return mins >= start && mins < end;
  });
}

// A family is decided by the catalog, not by a prefix of the id. While two
// families existed, "not deepseek means qwen" was a family test; D-68 left one
// family, and a two-way test with one arm removed is not a one-way test, it is
// a catch-all that cannot say no (D-71). An id at neither the catalog nor the
// hosted map returns null, and `resolve` refuses it.
export function familyOf(modelId, known = knownIds()) {
  return known.has(String(modelId)) ? "deepseek" : null;
}

// Native catalog names are not DashScope API ids (T48). The router owns the
// map so a caller never picks an id for a base it was handed. An id the table
// does not know passes through: an already-hosted id is not remapped twice.
export const HOSTED_IDS = {
  "deepseek-flash": "deepseek-v4.1-flash",
  "deepseek-v4-pro": "deepseek-v4-pro-0813",
};

// The one mapper, exported so a launcher imports it instead of keeping its own
// copy (T75, D-67).
export function hostedModel(model) {
  const id = String(model);
  return HOSTED_IDS[id] || id;
}

function providerModelFor(model, path) {
  if (path !== "dashscope") return model;
  return hostedModel(model);
}

function nowDate() {
  if (process.env.ROUTE_NOW) return new Date(process.env.ROUTE_NOW);
  return new Date();
}

// An id the router does not recognise is refused, not routed: no path, no
// base, no key, and a reason that names the refusal. The old answer fell into
// the qwen arm and handed a launcher the DashScope base and key for an id that
// exists at neither endpoint — every clause of it false (D-71).
function refused(model, requested, peak) {
  return {
    family: null,
    model,
    providerModel: null,
    requested,
    path: null,
    reason: "unrecognised-id",
    base: null,
    key: null,
    peak,
  };
}

export function resolve(picks, spec, now, nativeUp, known = knownIds()) {
  const model = picks.writerModel;
  const requested = picks.writerPath || "auto";
  const family = familyOf(model, known);
  const peak = isPeakAt(now, spec);

  if (family === null) return refused(model, requested, peak);

  if (requested === "dashscope") {
    return row(family, model, requested, "dashscope", "pin-dashscope", spec, peak);
  }
  if (requested === "native" && nativeUp !== false) {
    return row(family, model, requested, "native", "pin-native", spec, peak);
  }
  if (nativeUp === false) {
    return row(family, model, requested, "dashscope", "outage", spec, peak);
  }
  if (peak) {
    return row(family, model, requested, "dashscope", "peak", spec, peak);
  }
  return row(family, model, requested, "native", "off-peak", spec, peak);
}

function row(family, model, requested, path, reason, spec, peak) {
  const native = path === "native";
  return {
    family,
    model,
    providerModel: providerModelFor(model, path),
    requested,
    path,
    reason,
    base: native ? spec.bases.native : spec.bases.dashscope,
    key: native ? "DEEPSEEK_API_KEY" : "DASHSCOPE_API_KEY",
    peak,
  };
}

function printResolve(r) {
  for (const k of ["family", "model", "providerModel", "requested", "path", "reason", "base", "key", "peak"]) {
    console.log(k + "  " + r[k]);
  }
}

async function probe(spec) {
  const started = Date.now();
  try {
    const res = await fetch(spec.probe.url, {
      method: "GET",
      signal: AbortSignal.timeout(spec.probe.timeoutMs),
      headers: { accept: "application/json" },
    });
    return { up: true, status: res.status, ms: Date.now() - started };
  } catch {
    return { up: false, status: 0, ms: Date.now() - started };
  }
}

// The whole resolve branch, clock and health probe included, so the CLI and any
// importing runner get the same answer from the same file (T29). `env` is a
// seam for the clock and for pinning native health; it defaults to the live one.
export async function resolveNow(env = process.env) {
  const spec = pathsSpec();
  const picks = project();
  const now = env.ROUTE_NOW ? new Date(env.ROUTE_NOW) : new Date();
  let nativeUp;
  if (env.ROUTE_NATIVE === "down") nativeUp = false;
  else if (env.ROUTE_NATIVE === "up") nativeUp = true;
  else if ((picks.writerPath || "auto") !== "dashscope" && familyOf(picks.writerModel) === "deepseek") {
    const p = await probe(spec);
    nativeUp = p.up;
  }
  return resolve(picks, spec, now, nativeUp);
}

// The commands below are one caller of the resolver, not the resolver. Gated on
// this file being the entry point, because a runner imports this module (T29).
const isEntry = Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase();
const parsedArgs = isEntry ? parseArgs(process.argv.slice(2)) : { root: kitRoot, rest: [] };
const root = parsedArgs.root;
const cmd = isEntry ? parsedArgs.rest[0] || "resolve" : "";

if (cmd === "peak") {
  const spec = pathsSpec();
  const now = nowDate();
  console.log("now  " + now.toISOString());
  console.log("peak  " + isPeakAt(now, spec));
  process.exit(0);
}

if (cmd === "probe") {
  const spec = pathsSpec();
  const r = await probe(spec);
  console.log("up  " + r.up);
  console.log("status  " + r.status);
  console.log("ms  " + r.ms);
  process.exit(r.up ? 0 : 2);
}

// The dropped-id check a sibling can invoke: it reads the tree's own
// dropped.ids, examines the surfaces this router ships, and prints how many ids
// it examined. A dropped list that is empty is a failure, not a pass.
if (cmd === "check-dropped") {
  const audit = droppedAudit(shippedSurfaces(root), droppedIds(root));
  console.log("examined " + audit.examined + " id(s)");
  if (audit.status !== "clean") {
    for (const line of audit.lines) console.error(line);
    process.exit(1);
  }
  console.log("check-dropped ok");
  process.exit(0);
}

if (cmd === "resolve") {
  const r = await resolveNow();
  printResolve(r);
  process.exit(r.reason === "unrecognised-id" ? 1 : 0);
}

if (cmd === "--self-test") {
  const spec = pathsSpec();
  const failed = [];
  function want(label, got, exp) {
    if (got !== exp) failed.push(label + ": got " + got + " want " + exp);
  }
  want("weekend", isPeakAt(new Date("2026-09-19T02:00:00Z"), spec), false);
  want("fri-02", isPeakAt(new Date("2026-09-18T02:00:00Z"), spec), true);
  want("fri-04", isPeakAt(new Date("2026-09-18T04:00:00Z"), spec), false);
  want("fri-07", isPeakAt(new Date("2026-09-18T07:00:00Z"), spec), true);
  want("fri-10", isPeakAt(new Date("2026-09-18T10:00:00Z"), spec), false);

  // P1 — the ids the shipped maps offer are checked against the list
  // factory/writer-paths.json owns, read here and never written out again
  // (T29, T75). A dropped id put back into HOSTED_IDS, or added to the
  // catalog, lands in this clause. An empty list is a failure of the check,
  // not a pass: a check that examined nothing cannot be told from one that
  // never ran (F49).
  const dropped = droppedIds();
  want("the-dropped-list-is-empty-so-the-scan-proves-nothing", dropped.length > 0, true);
  const shipped = droppedAudit(shippedSurfaces(), dropped);
  want("the-shipped-surface-is-clean", shipped.status, "clean");
  if (shipped.status !== "clean") for (const line of shipped.lines) failed.push("  " + line);

  // P4 — a family comes from the catalog, not from a prefix (D-71).
  const known = knownIds();
  want("the-catalog-confers-a-family", familyOf("deepseek-flash", known), "deepseek");
  want("the-typo-has-no-family", familyOf("deepsek-flash", known), null);
  want("the-stranger-has-no-family", familyOf("kimi-k2", known), null);

  // T48 — the native-to-DashScope map stays, and is exercised.
  want("map-native-id", hostedModel("deepseek-v4-pro"), "deepseek-v4-pro-0813");
  want("map-passthrough", hostedModel("deepseek-v4.1-flash"), "deepseek-v4.1-flash");

  const ds = { writerModel: "deepseek-flash", writerPath: "auto" };
  want("ds-offpeak", resolve(ds, spec, new Date("2026-09-18T11:00:00Z"), true).reason, "off-peak");
  want("ds-peak", resolve(ds, spec, new Date("2026-09-18T07:00:00Z"), true).reason, "peak");
  want("ds-outage", resolve(ds, spec, new Date("2026-09-18T11:00:00Z"), false).reason, "outage");
  want(
    "ds-pin-peak",
    resolve({ writerModel: "deepseek-flash", writerPath: "native" }, spec, new Date("2026-09-18T02:00:00Z"), true)
      .reason,
    "pin-native",
  );
  want(
    "ds-pin-outage",
    resolve({ writerModel: "deepseek-flash", writerPath: "native" }, spec, new Date("2026-09-18T11:00:00Z"), false)
      .reason,
    "outage",
  );

  // P4 at the objects: this is the measurement D-71 was ruled from. One letter
  // dropped from the live pick used to answer family qwen, path dashscope,
  // reason qwen-has-no-native, key DASHSCOPE_API_KEY — every clause false, and
  // it buys a launch at the wrong base with the wrong key.
  const typo = resolve({ writerModel: "deepsek-flash", writerPath: "native" }, spec, new Date("2026-09-18T07:00:00Z"), true);
  want("typo-reason", typo.reason, "unrecognised-id");
  want("typo-family", typo.family, null);
  want("typo-path", typo.path, null);
  want("typo-key", typo.key, null);
  want("typo-base", typo.base, null);
  want("typo-providerModel", typo.providerModel, null);
  want(
    "stranger-reason",
    resolve({ writerModel: "kimi-k2", writerPath: "dashscope" }, spec, new Date("2026-09-18T07:00:00Z"), true).reason,
    "unrecognised-id",
  );

  const hosted = { writerModel: "deepseek-v4.1-flash", writerPath: "dashscope" };
  want("hosted-family", familyOf("deepseek-v4.1-flash"), "deepseek");
  want("hosted-pin", resolve(hosted, spec, new Date("2026-09-18T11:00:00Z"), true).reason, "pin-dashscope");
  want("hosted-key", resolve(hosted, spec, new Date("2026-09-18T11:00:00Z"), true).key, "DASHSCOPE_API_KEY");
  want(
    "hosted-base",
    resolve(hosted, spec, new Date("2026-09-18T11:00:00Z"), true).base,
    spec.bases.dashscope,
  );

  // The answer names the id its chosen base expects (T48, T29).
  want("native-id", resolve(ds, spec, new Date("2026-09-18T11:00:00Z"), true).providerModel, "deepseek-flash");
  want("dashscope-id", resolve(ds, spec, new Date("2026-09-18T07:00:00Z"), true).providerModel, "deepseek-v4.1-flash");
  want(
    "pin-native-id",
    resolve({ writerModel: "deepseek-flash", writerPath: "native" }, spec, new Date("2026-09-18T11:00:00Z"), true)
      .providerModel,
    "deepseek-flash",
  );
  want(
    "pin-native-outage-id",
    resolve({ writerModel: "deepseek-flash", writerPath: "native" }, spec, new Date("2026-09-18T11:00:00Z"), false)
      .providerModel,
    "deepseek-v4.1-flash",
  );
  want("already-hosted-id", resolve(hosted, spec, new Date("2026-09-18T11:00:00Z"), true).providerModel, "deepseek-v4.1-flash");

  // P3 — the seam, driven with lists this file writes: one clean, one dirty,
  // and the empty one, which must FAIL naming that it examined nothing.
  const clean = droppedAudit([{ label: "fixture", text: "aider --model deepseek/deepseek-chat" }], ["zzz-fixture-a"]);
  want("seam-clean-status", clean.status, "clean");
  want("seam-clean-examined", clean.examined, 1);
  const dirty = droppedAudit([{ label: "fixture", text: "aider --model ollama/zzz-fixture-b" }], ["zzz-fixture-b"]);
  want("seam-dirty-status", dirty.status, "dirty");
  want("seam-dirty-names-the-id", dirty.lines.join(" ").includes("zzz-fixture-b"), true);
  const empty = droppedAudit([{ label: "fixture", text: "anything" }], []);
  want("seam-empty-status", empty.status, "empty");
  want("seam-empty-examined", empty.examined, 0);
  want("seam-empty-names-that-it-examined-nothing", empty.lines.join(" ").includes("examined nothing"), true);
  const prefix = droppedAudit([{ label: "fixture", text: "zzz-fixture-b-plus" }], ["zzz-fixture-b"]);
  want("seam-prefix-is-not-a-hit", prefix.status, "clean");

  // P3's wiring half, and P4 at the CLI (F50, D-71): the fixtures drive the
  // exact command the gate runs, on a tree of their own, and read that tree's
  // own factory/writer-paths.json. A check carrying a hardcoded six passes the
  // seam clauses above and reds here — that gap is D-68.
  const self = fileURLToPath(import.meta.url);
  const runRoute = (args, tree) => spawnSync(process.execPath, [self, ...args, "--root", tree], { encoding: "utf8" });
  const trees = [];
  try {
    const mk = (name) => {
      const tree = mkdtempSync(join(tmpdir(), "grok-f52-" + name + "-"));
      trees.push(tree);
      mkdirSync(join(tree, "factory"), { recursive: true });
      writeFileSync(join(tree, "factory", "writer-paths.json"), JSON.stringify(pathsSpec()));
      return tree;
    };
    const fixtureId = "zzz-fixture-dropped";

    const one = mk("dropped-one");
    const oneSpec = JSON.parse(readFileSync(join(one, "factory", "writer-paths.json"), "utf8"));
    oneSpec.dropped = { ids: [fixtureId] };
    writeFileSync(join(one, "factory", "writer-paths.json"), JSON.stringify(oneSpec));
    const liveCount = JSON.parse(readFileSync(join(one, "factory", "writer-paths.json"), "utf8")).dropped.ids.length;
    const oneRun = runRoute(["check-dropped"], one);
    want("the-wiring-fixture-count-is-the-file-s-own", liveCount, 1);
    want("check-dropped-on-a-clean-tree", oneRun.status, 0);
    want(
      "check-dropped-did-not-report-the-tree-s-own-count",
      String(oneRun.stdout || "").includes("examined " + liveCount + " id(s)"),
      true,
    );

    const none = mk("dropped-none");
    const noneSpec = JSON.parse(readFileSync(join(none, "factory", "writer-paths.json"), "utf8"));
    noneSpec.dropped = { ids: [] };
    writeFileSync(join(none, "factory", "writer-paths.json"), JSON.stringify(noneSpec));
    const noneRun = runRoute(["check-dropped"], none);
    want("an-empty-dropped-list-passed", noneRun.status !== 0, true);
    want(
      "the-empty-list-failure-did-not-name-that-it-examined-nothing",
      String(noneRun.stderr || "").includes("examined nothing"),
      true,
    );
    want("the-empty-list-failure-did-not-report-zero-examined", String(noneRun.stdout || "").includes("examined 0 id(s)"), true);

    const catalogDirty = mk("dropped-catalog");
    const catalogSpec = JSON.parse(readFileSync(join(catalogDirty, "factory", "writer-paths.json"), "utf8"));
    catalogSpec.dropped = { ids: [fixtureId] };
    writeFileSync(join(catalogDirty, "factory", "writer-paths.json"), JSON.stringify(catalogSpec));
    writeFileSync(
      join(catalogDirty, "factory", "runtimes.json"),
      JSON.stringify({ catalog: { writerModel: [{ id: fixtureId }] } }),
    );
    const catalogRun = runRoute(["check-dropped"], catalogDirty);
    want("a-dropped-id-in-the-tree-s-own-catalog-did-not-red", catalogRun.status !== 0, true);
    want("the-catalog-hit-was-not-named", String(catalogRun.stderr || "").includes(fixtureId), true);

    // A tree whose catalog names an id the hosted map does not, and whose id
    // carries no prefix: the catalog confers the family (D-71).
    const cat = mk("catalog-family");
    writeFileSync(
      join(cat, "factory", "runtimes.json"),
      JSON.stringify({ catalog: { writerModel: [{ id: "fixture-model-x" }] } }),
    );
    writeFileSync(
      join(cat, "factory", "project.json"),
      JSON.stringify({ writerModel: "fixture-model-x", writerPath: "dashscope" }),
    );
    const catRun = runRoute(["resolve"], cat);
    want("an-id-with-no-prefix-that-the-catalog-names-was-refused", catRun.status, 0);
    want(
      "an-id-with-no-prefix-did-not-take-the-catalog-s-family",
      String(catRun.stdout || "").includes("family  deepseek"),
      true,
    );
    want(
      "an-id-with-no-prefix-was-not-pinned-to-its-requested-path",
      String(catRun.stdout || "").includes("reason  pin-dashscope"),
      true,
    );
    want("a-catalog-id-was-remapped", String(catRun.stdout || "").includes("providerModel  fixture-model-x"), true);

    // The typo, through the CLI the gate runs: refused, non-zero (D-71).
    const typoTree = mk("typo");
    writeFileSync(
      join(typoTree, "factory", "project.json"),
      JSON.stringify({ writerModel: "deepsek-flash", writerPath: "native" }),
    );
    const typoRun = runRoute(["resolve"], typoTree);
    want("the-typo-exited-zero", typoRun.status !== 0, true);
    want("the-typo-was-not-named-unrecognised", String(typoRun.stdout || "").includes("reason  unrecognised-id"), true);
    want("the-typo-was-handed-a-key", String(typoRun.stdout || "").includes("key  null"), true);
    want("the-typo-was-handed-a-path", String(typoRun.stdout || "").includes("path  null"), true);
  } finally {
    for (const tree of trees) rmSync(tree, { recursive: true, force: true });
  }

  if (failed.length) {
    console.error("self-test failed");
    for (const f of failed) console.error("  " + f);
    process.exit(1);
  }
  console.log("self-test ok");
  process.exit(0);
}

if (isEntry) {
  console.error("usage: node factory/tools/route.mjs resolve|peak|probe|check-dropped|--self-test");
  process.exit(1);
}
