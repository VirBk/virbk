#!/usr/bin/env node
// GitHub Action writer runner. Hands, not judgment. Does not call a model
// itself; it launches qwen-code. Idle is success. Missing secret is a loud
// skip, not a red badge. Never pushes main.
//
//   node factory/tools/ghaWriter.mjs watch
//   node factory/tools/ghaWriter.mjs run
//   node factory/tools/ghaWriter.mjs --self-test

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const HOSTED = {
  "qwen3-coder": "qwen3-coder-plus",
  "deepseek-flash": "deepseek-v4.1-flash",
  "deepseek-v4-pro": "deepseek-v4-pro-0813",
};

function fail(label, errors) {
  console.error(label);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

function lanes() {
  const dir = join(root, "factory/envelopes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^F\d+\.md$/i.test(f))
    .map((f) => f.slice(0, -3))
    .sort();
}

function git(args, opts = {}) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    ...opts,
  });
}

function hostedModel() {
  const picks = JSON.parse(readFileSync(join(root, "factory/project.json"), "utf8"));
  const id = picks.writerModel;
  return HOSTED[id] || id;
}

function hasWriterSecret() {
  return Boolean(
    (process.env.DASHSCOPE_API_KEY || "").trim() ||
      (process.env.DEEPSEEK_API_KEY || "").trim(),
  );
}

function assertNotMain(ref) {
  const name = String(ref || "").replace(/^refs\/heads\//, "");
  if (!name || name === "main" || name === "master") {
    fail("refused", ["never push main"]);
  }
  if (!/^writer\/F\d+$/i.test(name)) {
    fail("refused", ["branch must be writer/<lane>: " + name]);
  }
}

const cmd = process.argv[2] || "watch";

if (cmd === "watch") {
  const list = lanes();
  if (!list.length) {
    console.log("idle");
    process.exit(0);
  }
  console.log("issued " + list.join(" "));
  process.exit(0);
}

if (cmd === "run") {
  const list = lanes();
  if (!list.length) {
    console.log("idle");
    process.exit(0);
  }
  if (!hasWriterSecret()) {
    console.log("skip loudly: writer secret missing");
    process.exit(0);
  }
  const qwen = spawnSync("qwen", ["--version"], { encoding: "utf8" });
  if (qwen.status !== 0) {
    fail("qwen-code missing", ["npm install -g @qwen-code/qwen-code"]);
  }
  const lane = list[0];
  const branch = "writer/" + lane;
  assertNotMain(branch);
  const envPath = join(root, "factory/envelopes", lane + ".md");
  const envelope = readFileSync(envPath, "utf8");
  // The prompt is the packet, not the envelope alone: AGENTS, the live
  // board slice, the traps digest, then this envelope. A seat handed only
  // an envelope goes and reads the repository, and bills for it (T61).
  const packet = spawnSync(
    process.execPath,
    [join(root, "factory/tools/packet.mjs"), "seat", lane],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const prompt = packet.status === 0 && (packet.stdout || "").includes("AGENTS")
    ? packet.stdout
    : envelope;
  console.log("# prompt " + (prompt === envelope ? "envelope only (packet failed)" : "packet") + " " + prompt.length + " bytes");
  const model = hostedModel();
  const setup = git(["config", "user.email", "199931366+VirBk@users.noreply.github.com"]);
  git(["config", "user.name", "VirBk"]);
  git(["checkout", "-B", branch]);
  const env = {
    ...process.env,
    OPENAI_BASE_URL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    OPENAI_API_KEY: process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || "",
    OPENAI_MODEL: model,
  };
  console.log("# lane " + lane);
  console.log("# model " + model);
  console.log("# branch " + branch);
  const write = spawnSync(
    "qwen",
    ["--auth-type", "openai", "--model", model, "--yolo", "-p", prompt],
    { cwd: root, encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024 },
  );
  process.stdout.write(write.stdout || "");
  process.stderr.write(write.stderr || "");
  if (write.status !== 0) {
    process.exit(write.status === null ? 1 : write.status);
  }
  git(["add", "-A"]);
  const dirty = git(["status", "--porcelain"]);
  if (!(dirty.stdout || "").trim()) {
    console.log("writer made no file changes");
    process.exit(0);
  }
  const commit = git(["commit", "-m", lane + ": writer return"]);
  process.stdout.write(commit.stdout || "");
  process.stderr.write(commit.stderr || "");
  if (commit.status !== 0) process.exit(commit.status === null ? 1 : commit.status);
  assertNotMain(branch);
  const push = git(["push", "-u", "origin", "refs/heads/" + branch + ":refs/heads/" + branch]);
  process.stdout.write(push.stdout || "");
  process.stderr.write(push.stderr || "");
  if (push.status !== 0) process.exit(push.status === null ? 1 : push.status);
  console.log("pushed " + branch + " (not main)");
  process.exit(0);
}

if (cmd === "--self-test") {
  const errors = [];
  const landing = readFileSync(join(root, ".github/workflows/landing.yml"), "utf8");
  const writer = readFileSync(join(root, ".github/workflows/writer.yml"), "utf8");
  const src = readFileSync(join(root, "factory/tools/ghaWriter.mjs"), "utf8");
  if (/DASHSCOPE_API_KEY|DEEPSEEK_API_KEY/.test(landing)) {
    errors.push("landing.yml must not name writer secrets");
  }
  if (!/secrets\.DASHSCOPE_API_KEY/.test(writer)) {
    errors.push("writer.yml must map secrets.DASHSCOPE_API_KEY");
  }
  if (!src.includes('const branch = "writer/" + lane')) {
    errors.push("ghaWriter.mjs must name writer/<lane>");
  }
  if (!src.includes("factory/tools/packet.mjs")) {
    errors.push("ghaWriter.mjs must launch the writer with the packet");
  }
  if (writer.includes("git push")) {
    errors.push("writer.yml must not git push; ghaWriter.mjs owns the push");
  }
  if (!src.includes('":refs/heads/" + branch')) {
    errors.push("push dest must be the lane branch");
  }
  if ((src.match(/assertNotMain/g) || []).length < 3) {
    errors.push("ghaWriter.mjs missing main refusal");
  }
  if (lanes().length) errors.push("live envelopes present; watch would not be idle");
  const w = spawnSync(process.execPath, [join(root, "factory/tools/ghaWriter.mjs"), "watch"], {
    cwd: root,
    encoding: "utf8",
  });
  if ((w.stdout || "").trim() !== "idle") errors.push("watch should print idle, got " + JSON.stringify(w.stdout));
  if (errors.length) fail("self-test failed", errors);
  console.log("self-test ok");
  process.exit(0);
}

console.error("usage: node factory/tools/ghaWriter.mjs watch|run|--self-test");
process.exit(1);
