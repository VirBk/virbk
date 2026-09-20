#!/usr/bin/env node
// Dumb writer-path router. No model. No API keys.
//
//   node factory/tools/route.mjs resolve
//   node factory/tools/route.mjs peak
//   node factory/tools/route.mjs probe
//   node factory/tools/route.mjs --self-test
//
// Clock: ROUTE_NOW=2026-09-18T07:00:00Z
// Native health (resolve only): ROUTE_NATIVE=up|down
//
// The answer is one object: path, reason, base, key NAME and the model id that
// base expects. A second caller asks for it instead of keeping its own copy of
// any of the five (T29, T48); `resolveNow` is the whole resolve branch, and
// the CLI below is one caller of it, not the resolver.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function project() {
  return loadJson(join(root, "factory/project.json"));
}

function pathsSpec() {
  return loadJson(join(root, "factory/writer-paths.json"));
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

function familyOf(modelId) {
  return String(modelId).startsWith("deepseek") ? "deepseek" : "qwen";
}

// Native catalog names are not DashScope API ids (T48). The router owns the
// map so a caller never picks an id for a base it was handed. An id the table
// does not know passes through: an already-hosted id is not remapped twice.
const HOSTED_IDS = {
  "qwen3-coder": "qwen3-coder-plus",
  "deepseek-flash": "deepseek-v4.1-flash",
  "deepseek-v4-pro": "deepseek-v4-pro-0813",
};

function providerModelFor(model, path) {
  if (path !== "dashscope") return model;
  return HOSTED_IDS[model] || model;
}

function nowDate() {
  if (process.env.ROUTE_NOW) return new Date(process.env.ROUTE_NOW);
  return new Date();
}

export function resolve(picks, spec, now, nativeUp) {
  const model = picks.writerModel;
  const requested = picks.writerPath || "auto";
  const family = familyOf(model);
  const peak = isPeakAt(now, spec);

  if (family === "qwen") {
    return {
      family,
      model,
      providerModel: providerModelFor(model, "dashscope"),
      requested,
      path: "dashscope",
      reason: requested === "native" ? "qwen-has-no-native" : "qwen-dashscope",
      base: spec.bases.dashscope,
      key: "DASHSCOPE_API_KEY",
      peak,
    };
  }

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
const cmd = isEntry ? process.argv[2] || "resolve" : "";

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

if (cmd === "resolve") {
  printResolve(await resolveNow());
  process.exit(0);
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

  const qwen = { writerModel: "qwen3.7-flash", writerPath: "auto" };
  want("qwen-path", resolve(qwen, spec, new Date("2026-09-18T02:00:00Z"), true).path, "dashscope");
  want(
    "qwen-native-pin",
    resolve({ writerModel: "qwen3.8-max", writerPath: "native" }, spec, new Date(), true).reason,
    "qwen-has-no-native",
  );

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
  want(
    "qwen-coder-id",
    resolve({ writerModel: "qwen3-coder", writerPath: "auto" }, spec, new Date("2026-09-18T02:00:00Z"), true)
      .providerModel,
    "qwen3-coder-plus",
  );
  want("already-hosted-id", resolve(hosted, spec, new Date("2026-09-18T11:00:00Z"), true).providerModel, "deepseek-v4.1-flash");

  if (failed.length) {
    console.error("self-test failed");
    for (const f of failed) console.error("  " + f);
    process.exit(1);
  }
  console.log("self-test ok");
  process.exit(0);
}

if (isEntry) {
  console.error("usage: node factory/tools/route.mjs resolve|peak|probe|--self-test");
  process.exit(1);
}
