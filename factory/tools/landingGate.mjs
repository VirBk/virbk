#!/usr/bin/env node
// Landing gate. Runs factory/landing-checks.json from a fresh git archive
// of the commit under test. Does not fall back to this tree's copy.
//
//   node factory/tools/landingGate.mjs
//   node factory/tools/landingGate.mjs --sha HEAD
//   node factory/tools/landingGate.mjs --self-test
//
// Every step's exit code is captured. A pipe must not swallow failure:
// steps run through bash -e from a file.
//
// The archive is read from `git archive` on stdout and unpacked by this
// file. It does not shell out to tar: a Windows temp path interpolated
// into a shell string is mangled, and a gate that only runs on the CI
// runner is a badge, not a gate (T60).
//
// A step named by an open, unexpired row in factory/experiments.json
// still RUNS and still prints what it found; it does not fail the
// landing. The rows are read from the archive, like the manifest, so a
// commit carries its own exceptions and they expire on a stated date.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suspendedBy } from "./experiment.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function git(args, opts = {}) {
  const r = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + " failed");
  return (r.stdout || "").trim();
}

function octal(buf) {
  const s = buf.toString("ascii").replace(/\0.*$/, "").trim();
  if (!s) return 0;
  const n = parseInt(s, 8);
  return Number.isFinite(n) ? n : 0;
}

// Minimal ustar/pax reader. git archive emits regular files and dirs; a
// long path arrives as a GNU 'L' record or a pax 'x' header.
export function untar(buf, dest) {
  const written = [];
  let offset = 0;
  let longName = "";
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((b) => b === 0)) continue;
    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const size = octal(header.subarray(124, 136));
    const type = String.fromCharCode(header[156]) || "0";
    const blocks = Math.ceil(size / 512) * 512;
    const body = buf.subarray(offset, offset + size);
    offset += blocks;

    if (type === "L") {
      longName = body.toString("utf8").replace(/\0.*$/, "");
      continue;
    }
    if (type === "x" || type === "g") {
      const text = body.toString("utf8");
      const m = /\d+ path=([^\n]+)\n/.exec(text);
      if (m) longName = m[1];
      continue;
    }

    let name = longName || (prefix ? prefix + "/" + rawName : rawName);
    longName = "";
    if (!name || name.includes("..")) continue;
    const full = join(dest, name);
    if (type === "5") {
      mkdirSync(full, { recursive: true });
      continue;
    }
    if (type !== "0" && type !== "\0" && type !== "") continue;
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
    written.push(name);
  }
  return written;
}

function archiveTo(sha, dest) {
  // -c core.autocrlf=false -c core.eol=lf: the archive is the committed
  // bytes on every platform, so a size budget measures the same number
  // here and on the runner.
  const r = spawnSync(
    "git",
    ["-c", "core.autocrlf=false", "-c", "core.eol=lf", "archive", "--format=tar", sha],
    { cwd: repoRoot, maxBuffer: 512 * 1024 * 1024 },
  );
  if (r.status !== 0 || !r.stdout || !r.stdout.length) return null;
  return untar(r.stdout, dest);
}

function tempPair(short) {
  const workDir = join(tmpdir(), "grok-gate-" + short + "-" + randomBytes(4).toString("hex"));
  const logDir = workDir + "-logs";
  mkdirSync(workDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  return { workDir, logDir };
}

// A tar this file wrote, unpacked by this file. No repository needed,
// so the step also runs inside the archive the gate builds.
function tarEntry(name, body, type) {
  const NUL = String.fromCharCode(0);
  const head = Buffer.alloc(512, 0);
  head.write(name.slice(0, 100), 0, "utf8");
  head.write("0000644" + NUL, 100, "ascii");
  head.write(body.length.toString(8).padStart(11, "0") + NUL, 124, "ascii");
  head.write(type, 156, "ascii");
  head.write("ustar" + NUL + "00", 257, "ascii");
  const pad = Buffer.alloc((512 - (body.length % 512)) % 512, 0);
  return Buffer.concat([head, body, pad]);
}

function synthTest(errors) {
  const longName = "factory/" + "deep/".repeat(22) + "name.txt";
  const parts = [
    tarEntry("short.txt", Buffer.from("alpha"), "0"),
    tarEntry("./@LongLink", Buffer.from(longName), "L"),
    tarEntry(longName.slice(0, 100), Buffer.from("beta"), "0"),
    Buffer.alloc(1024, 0),
  ];
  const dir = mkdtempSync(join(tmpdir(), "grok-untar-"));
  try {
    const written = untar(Buffer.concat(parts), dir);
    if (!written.includes("short.txt")) errors.push("untar lost a short name");
    if (readFileSync(join(dir, "short.txt"), "utf8") !== "alpha") errors.push("untar corrupted a body");
    if (!written.includes(longName)) errors.push("untar lost a GNU long name");
    if (readFileSync(join(dir, longName), "utf8") !== "beta") errors.push("untar corrupted a long-name body");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}


// A suspended step that fails is a measurement, not a landing failure.
export function failures(results) {
  return results.filter((r) => r.status !== null && r.status !== 0 && !r.suspended);
}

function selfTest() {
  // The gate must unpack on the platform the control plane actually runs
  // on. Proof is bytes out of the archive equal to bytes out of git.
  const errors = [];
  synthTest(errors);
  const sample = [
    { name: "passes", status: 0, suspended: null },
    { name: "fails", status: 1, suspended: null },
    { name: "fails while suspended", status: 1, suspended: "X01" },
    { name: "no run", status: null, suspended: null },
  ];
  const got = failures(sample).map((r) => r.name);
  if (got.join(",") !== "fails") {
    errors.push("suspension changed which steps fail the landing: " + got.join(","));
  }
  const inRepo = spawnSync("git", ["-C", repoRoot, "rev-parse", "--git-dir"], { encoding: "utf8" }).status === 0;
  if (!inRepo) {
    if (errors.length) {
      console.error("landingGate self-test failed");
      for (const e of errors) console.error("  " + e);
      process.exit(1);
    }
    console.log("landingGate self-test ok (unpack only; no repository here)");
    process.exit(0);
  }
  const sha = git(["rev-parse", "HEAD"]);
  const { workDir } = tempPair("selftest");
  try {
    const written = archiveTo(sha, workDir);
    if (!written) {
      errors.push("git archive produced nothing on this platform");
    } else {
      const tracked = git(["ls-tree", "-r", "--name-only", sha]).split(String.fromCharCode(10)).filter(Boolean);
      const missing = tracked.filter((rel) => !written.includes(rel));
      if (missing.length) errors.push("archive missed " + missing.length + " tracked files");
      for (const rel of ["factory/landing-checks.json", "AGENTS.md", "factory/tools/landingGate.mjs"]) {
        if (!written.includes(rel)) {
          errors.push("archive missing " + rel);
          continue;
        }
        const fromGit = spawnSync("git", ["show", sha + ":" + rel], {
          cwd: repoRoot,
          maxBuffer: 64 * 1024 * 1024,
        });
        const unpacked = readFileSync(join(workDir, rel));
        if (Buffer.compare(fromGit.stdout, unpacked) !== 0) {
          errors.push("unpacked bytes differ from git show: " + rel);
        }
      }
      try {
        JSON.parse(readFileSync(join(workDir, "factory/landing-checks.json"), "utf8"));
      } catch (err) {
        errors.push("unpacked landing-checks.json does not parse: " + String(err.message || err));
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  if (errors.length) {
    console.error("landingGate self-test failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("landingGate self-test ok");
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

const shaArg = process.argv.includes("--sha")
  ? process.argv[process.argv.indexOf("--sha") + 1]
  : "HEAD";

const sha = git(["rev-parse", shaArg]);
const short = sha.slice(0, 7);
const { workDir, logDir } = tempPair(short);

if (!archiveTo(sha, workDir)) {
  console.error("archive failed");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(workDir, "factory/landing-checks.json"), "utf8"));
} catch (err) {
  console.error("commit", sha, "has no parseable factory/landing-checks.json");
  console.error(String(err.message || err));
  console.error("The gate does not fall back to this tree.");
  process.exit(1);
}

const steps = Array.isArray(manifest.steps) ? manifest.steps : [];
const results = [];

console.log("grok landing gate");
console.log("  commit   " + sha);
console.log("  archive  " + workDir);
console.log("  steps    " + steps.length);
console.log("");

for (const [i, step] of steps.entries()) {
  const n = i + 1;
  if (!step.run) {
    console.log("  --  " + String(n).padStart(2, "0") + "  " + step.name + "  (no run)");
    results.push({ name: step.name, status: null });
    continue;
  }
  const sus = suspendedBy(workDir, step.name);
  process.stdout.write("  ..  " + String(n).padStart(2, "0") + "  " + step.name + " ... ");
  const scriptPath = join(logDir, String(n).padStart(2, "0") + ".sh");
  writeFileSync(scriptPath, step.run.endsWith("\n") ? step.run : step.run + "\n");
  const r = spawnSync("bash", ["-e", scriptPath], {
    cwd: workDir,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const status = r.status === null ? 1 : r.status;
  results.push({ name: step.name, status, suspended: sus ? sus.id : null });
  if (status === 0) {
    console.log(sus ? "ok — " + sus.id + " suspends it and it passes anyway" : "ok");
  } else {
    console.log(sus ? "FAILED — suspended by " + sus.id + " until " + sus.expires : "FAILED");
  }
  writeFileSync(join(logDir, String(n).padStart(2, "0") + ".txt"), (r.stdout || "") + (r.stderr || ""));
}

const failed = failures(results);
const suspended = results.filter((r) => r.suspended && r.status !== 0);
console.log("");
for (const s of suspended) {
  console.log("  suspended  " + s.name + " failed under " + s.suspended + " — kept out of the verdict");
}
if (suspended.length) console.log("  logs       " + logDir);
if (failed.length === 0) {
  rmSync(workDir, { recursive: true, force: true });
  if (!suspended.length) rmSync(logDir, { recursive: true, force: true });
  console.log(suspended.length ? "GATE PASSED with " + suspended.length + " suspended" : "GATE PASSED");
  process.exit(0);
}
console.log("GATE FAILED");
for (const f of failed) console.log("  " + f.name + " exit " + f.status);
console.log("  archive " + workDir);
process.exit(1);
