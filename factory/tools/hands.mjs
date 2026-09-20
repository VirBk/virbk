#!/usr/bin/env node
// Dumb hands. No model. No API keys. Judgment stays in the control plane.
//
//   node factory/tools/hands.mjs check
//   node factory/tools/hands.mjs pick
//   node factory/tools/hands.mjs apply-topology <id>
//   node factory/tools/hands.mjs recipe
//   node factory/tools/hands.mjs isolate --lane F3 --base <sha>
//   node factory/tools/hands.mjs envelope --lane F3
//   node factory/tools/hands.mjs gate --sha <sha>
//   node factory/tools/hands.mjs land --lane F3 --sha <sha>
//   node factory/tools/hands.mjs launch -- <command> [args...]
//   node factory/tools/hands.mjs watch
//   node factory/tools/hands.mjs --self-test

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PICK_KEYS = [
  "controlPlane",
  "hands",
  "writerHarness",
  "writerModel",
  "isolate",
  "land",
  "envelopeStore",
  "access",
  "commitCredit",
  "promptCache",
  "helpMode",
  "writerMeter",
  "writerPath",
];

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runtimes() {
  return loadJson(join(root, "factory/runtimes.json"));
}

function projectPath() {
  return join(root, "factory/project.json");
}

function project() {
  return loadJson(projectPath());
}

function catalogIds(rt, key) {
  const rows = rt.catalog?.[key];
  if (!Array.isArray(rows)) throw new Error("catalog missing " + key);
  return new Set(rows.map((r) => (typeof r === "string" ? r : r.id)));
}

function pickErrors(picks, rt) {
  const errors = [];
  if (!picks || typeof picks !== "object" || Array.isArray(picks)) {
    return ["not an object"];
  }
  const extra = Object.keys(picks).filter((k) => !PICK_KEYS.includes(k));
  if (extra.length) errors.push("unknown fields: " + extra.join(", "));
  for (const key of PICK_KEYS) {
    if (typeof picks[key] !== "string" || picks[key].length < 1) {
      errors.push("missing " + key);
      continue;
    }
    const allowed = catalogIds(rt, key);
    if (!allowed.has(picks[key])) {
      errors.push(key + " id not in catalog: " + picks[key]);
    }
  }
  if (picks.hands === "hands.mjs" && picks.controlPlane === undefined) {
    errors.push("hands without control plane");
  }
  return errors;
}

function fail(label, errors) {
  console.error(label);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

function parentRemote() {
  try {
    return String(loadJson(join(root, "factory/lineage.json")).parent || "").trim();
  } catch {
    return "";
  }
}

function helpTarget(picks) {
  if (!picks || picks.helpMode === "none") return "";
  const path = join(root, "factory/help.json");
  if (!existsSync(path)) return "";
  try {
    const h = loadJson(path);
    return typeof h.target === "string" ? h.target.trim() : "";
  } catch {
    return "";
  }
}

function helpErrors(picks) {
  const errors = [];
  if (!picks || picks.helpMode === "none" || picks.helpMode === "overlay-pin") return errors;
  const path = join(root, "factory/help.json");
  if (!existsSync(path)) {
    errors.push("helpMode " + picks.helpMode + " needs factory/help.json (see factory/help.example.json)");
    return errors;
  }
  const target = helpTarget(picks);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target)) {
    errors.push("factory/help.json target must be owner/repo");
  }
  const parent = parentRemote();
  if (parent && target.toLowerCase() === parent.toLowerCase()) {
    errors.push("help target cannot be the parent remote: " + parent);
  }
  return errors;
}

function flag(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : "";
}

function git(args, cwd = root) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r;
}

function envelopePath(lane) {
  return join(root, "factory/envelopes", lane + ".md");
}

function printRecipe(picks) {
  const harness = picks.writerHarness;
  const r = spawnSync(process.execPath, [join(root, "factory/tools/seat.mjs"), "recipe", harness], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || "recipe failed\n");
    process.exit(r.status === null ? 1 : r.status);
  }
  process.stdout.write(r.stdout || "");
  process.stdout.write("\n# model " + picks.writerModel + "\n");
  process.stdout.write("# isolate " + picks.isolate + "  land " + picks.land + "  access " + picks.access + "  credit " + picks.commitCredit + "  cache " + picks.promptCache + "  help " + picks.helpMode + "\n");
}

const cmd = process.argv[2] || "pick";

if (cmd === "check") {
  const picks = project();
  const rt = runtimes();
  const errors = pickErrors(picks, rt).concat(helpErrors(picks));
  if (errors.length) fail("project picks failed", errors);
  const sit = spawnSync(process.execPath, [join(root, "factory/tools/sitting.mjs"), "check"], {
    cwd: root,
    encoding: "utf8",
  });
  if (sit.status !== 0) {
    process.stderr.write(sit.stderr || sit.stdout || "sitting check failed\n");
    process.exit(sit.status === null ? 1 : sit.status);
  }
  console.log("project picks ok");
  process.exit(0);
}

if (cmd === "pick") {
  const picks = project();
  const errors = pickErrors(picks, runtimes());
  if (errors.length) fail("project picks failed", errors);
  for (const key of PICK_KEYS) console.log(key + "  " + picks[key]);
  process.exit(0);
}

if (cmd === "apply-topology") {
  const id = process.argv[3] || "";
  const rt = runtimes();
  const topo = (rt.topologies || []).find((t) => t.id === id);
  if (!topo) {
    const ids = (rt.topologies || []).map((t) => t.id).join(", ");
    fail("unknown topology", [id || "(none)", "try: " + ids]);
  }
  const next = { ...(rt.default || {}), ...(topo.picks || {}) };
  const errors = pickErrors(next, rt);
  if (errors.length) fail("topology picks failed", errors);
  writeFileSync(projectPath(), JSON.stringify(next, null, 2) + "\n");
  console.log("wrote factory/project.json  " + id);
  process.exit(0);
}

if (cmd === "recipe") {
  const picks = project();
  const errors = pickErrors(picks, runtimes());
  if (errors.length) fail("project picks failed", errors);
  printRecipe(picks);
  process.exit(0);
}

if (cmd === "envelope") {
  const lane = flag("--lane");
  if (!lane) fail("usage", ["node factory/tools/hands.mjs envelope --lane F3"]);
  const path = envelopePath(lane);
  if (!existsSync(path)) fail("envelope missing", [path]);
  console.log(path);
  process.exit(0);
}

if (cmd === "isolate") {
  const lane = flag("--lane");
  const base = flag("--base");
  if (!lane || !base) fail("usage", ["node factory/tools/hands.mjs isolate --lane F3 --base <sha>"]);
  const picks = project();
  const errors = pickErrors(picks, runtimes());
  if (errors.length) fail("project picks failed", errors);
  const remote = git(["remote", "get-url", "origin"]);
  const url = (remote.stdout || "").trim() || "origin";
  if (picks.isolate === "cloud-clone") {
    const dest = "/tmp/grok-" + lane.toLowerCase();
    console.log("# cloud clone. Not the owner's disk. Prefer git-bus or codespace.");
    console.log("git clone --depth 1 " + url + " " + dest);
    console.log("git -C " + dest + " fetch --depth 1 origin " + base);
    console.log("git -C " + dest + " checkout " + base);
    process.exit(0);
  }
  if (picks.isolate === "codespace") {
    console.log("# codespace. Not the owner's disk. Writer token is a Codespaces secret, not git.");
    console.log("# Place DEEPSEEK_API_KEY or DASHSCOPE_API_KEY once. Do not add an Action while it would stay red.");
    console.log("gh codespace create -r " + url.replace(/\.git$/, "").replace(/^.*github\.com[:/]/, "") + " -b main --display-name grok-" + lane.toLowerCase());
    console.log("gh codespace ssh -- 'git fetch origin && git checkout " + base + " && node factory/tools/hands.mjs recipe'");
    process.exit(0);
  }
  if (picks.isolate === "help-clone") {
    if (picks.helpMode === "none") fail("help isolate failed", ["help-clone needs helpMode fork-and-pr or collaborator-branch"]);
    const herr = helpErrors(picks);
    if (herr.length) fail("help isolate failed", herr);
    const target = helpTarget(picks);
    const dest = "../grok-" + lane.toLowerCase();
    console.log("# help-clone. Factory stays here. Product is " + target + ". Not a second remote on this repo.");
    console.log("# Envelope holds are product paths. Do not add factory/ to that tree. Do not land " + target + " main from here.");
    if (picks.helpMode === "fork-and-pr") {
      console.log("gh repo fork " + target + " --clone=false");
      console.log("git clone https://github.com/" + target + " " + dest);
    } else {
      console.log("git clone https://github.com/" + target + " " + dest);
    }
    console.log("git -C " + dest + " fetch origin");
    console.log("git -C " + dest + " checkout " + base);
    console.log("# writer works in " + dest + ", pushes a branch, opens a PR to " + target);
    console.log("# gh pr create --repo " + target + " --head <branch>");
    process.exit(0);
  }
  if (picks.isolate === "git-bus") {
    const fetched = git(["fetch", "origin"]);
    process.stderr.write(fetched.stderr || "");
    console.log("# git-bus. Envelope was the deploy. This is the machine that already autobuilds.");
  }
  const r = spawnSync(
    process.execPath,
    [join(root, "factory/tools/seat.mjs"), "worktree", "--lane", lane, "--base", base],
    { cwd: root, encoding: "utf8" },
  );
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  process.exit(r.status === null ? 1 : r.status);
}

if (cmd === "gate") {
  const sha = flag("--sha") || "HEAD";
  const r = spawnSync(process.execPath, [join(root, "factory/tools/landingGate.mjs"), "--sha", sha], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  process.exit(r.status === null ? 1 : r.status);
}

if (cmd === "launch") {
  const raw = process.argv.slice(3);
  const args = raw[0] === "--" ? raw.slice(1) : raw;
  if (!args.length) {
    fail("usage", ["node factory/tools/hands.mjs launch -- <command> [args...]"]);
  }
  const child = spawn(args[0], args.slice(1), {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  console.log("launched pid " + child.pid);
  process.exit(0);
}

if (cmd === "land") {
  const lane = flag("--lane");
  const sha = flag("--sha");
  if (!lane || !sha) fail("usage", ["node factory/tools/hands.mjs land --lane F3 --sha <sha>"]);
  const picks = project();
  const errors = pickErrors(picks, runtimes());
  if (errors.length) fail("project picks failed", errors);
  const envPath = envelopePath(lane);
  if (!existsSync(envPath)) fail("envelope missing", [envPath]);
  if (picks.land === "github-rebase-after-approved") {
    if (picks.helpMode !== "none") {
      const herr = helpErrors(picks);
      if (herr.length) fail("help land failed", herr);
      const target = helpTarget(picks);
      console.log("# printed only. Product PR to " + target + ". Factory files are not in that PR. Do not land " + target + " main from this factory.");
      console.log("gh pr create --repo " + target + " --head <branch>");
      console.log("gh pr merge --rebase --match-head-commit " + sha + " --repo " + target);
      process.exit(0);
    }
    console.log("# printed only. A red Action is a hard fail. Merge after VERDICT: APPROVED.");
    console.log("gh pr merge --rebase --match-head-commit " + sha);
    process.exit(0);
  }
  const merge = git(["merge", "--ff-only", sha]);
  process.stdout.write(merge.stdout || "");
  process.stderr.write(merge.stderr || "");
  if (merge.status !== 0) process.exit(merge.status === null ? 1 : merge.status);
  console.log("ff-only " + sha);
  process.exit(0);
}


if (cmd === "watch") {
  const dir = join(root, "factory/envelopes");
  const lanes = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => f.slice(0, -3))
    : [];
  if (!lanes.length) {
    console.log("idle");
    process.exit(0);
  }
  const base = (git(["rev-parse", "origin/main"]).stdout || git(["rev-parse", "HEAD"]).stdout || "").trim();
  for (const lane of lanes) {
    console.log("node factory/tools/hands.mjs isolate --lane " + lane + " --base " + base);
    console.log("node factory/tools/hands.mjs recipe");
  }
  process.exit(0);
}

if (cmd === "--self-test") {
  const rt = runtimes();
  const failed = [];
  const good = pickErrors(rt.default, rt);
  if (good.length) failed.push("default: " + good.join(", "));
  const live = pickErrors(project(), rt);
  if (live.length) failed.push("live: " + live.join(", "));
  const bad = pickErrors({ ...rt.default, writerHarness: "claude-desktop" }, rt);
  if (!bad.length) failed.push("unknown harness should fail");
  const extra = pickErrors({ ...rt.default, surprise: "1" }, rt);
  if (!extra.length) failed.push("extra field should fail");
  for (const t of rt.topologies || []) {
    const next = { ...(rt.default || {}), ...(t.picks || {}) };
    const err = pickErrors(next, rt);
    if (err.length) failed.push(t.id + ": " + err.join(", "));
  }
  if (failed.length) fail("self-test failed", failed);
  console.log("self-test ok");
  process.exit(0);
}

console.error(
  "usage: node factory/tools/hands.mjs check|pick|apply-topology|recipe|isolate|envelope|gate|land|launch|watch|--self-test",
);
process.exit(1);
