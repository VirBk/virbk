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
//
// Before the first step runs, the shell is probed THE WAY A STEP IS RUN:
// a file in the log dir, spawned as `<shell> -e <file>`, cwd set to the
// unpacked archive. When that shell cannot run the steps the gate prints
// one diagnostic naming it and exits EXIT_UNRUNNABLE with no step lines.
// A launcher that cannot read a Windows path as a file reds all 21 steps
// at ANY commit — green from git-bash a second later (S24) — and a seat
// reading step names cannot see why. The probe form is the whole point:
// one shaped `bash -c true` succeeds under that launcher and closes
// nothing.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { suspendedBy } from "./experiment.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);

// Steps are spawned as `<SHELL> -e <script>` with cwd = the unpacked
// archive. One form only, and the probe takes that same form.
//
// GATE_SHELL names that shell. It exists so a fixture can spawn the
// shipped CLI as a process — the entry point is not reachable from the
// exports — without editing this file. Unset, which is every ordinary
// launch and the public Action, the shell is `bash`: exactly the path
// before the variable existed.
const DEFAULT_SHELL = "bash";
const SHELL = process.env.GATE_SHELL || DEFAULT_SHELL;

// GATE FAILED — the commit is bad.
export const EXIT_FAILED = 1;
// The shell cannot run the gate. Not a verdict on the commit, and not
// the status of a failed gate, so a caller and a seat can tell them
// apart: "this shell cannot run the gate" versus "your commit is bad".
export const EXIT_UNRUNNABLE = 2;

// Probe the shell the way a step is run: a file in logDir, spawned as
// `<shell> -e <file>`, cwd set to workDir. The form is the whole point
// (T09): a probe shaped `bash -c true` SUCCEEDS under the WSL launcher
// and leaves the 21 reds where they are.
export function probeShell(shell, workDir, logDir, spawn = spawnSync) {
  const script = join(logDir, "00-probe.sh");
  writeFileSync(script, "exit 0" + NL);
  const r = spawn(shell, ["-e", script], {
    cwd: workDir,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const spawned = !r.error;
  const status = spawned ? (r.status === null ? 1 : r.status) : null;
  return {
    shell,
    script,
    cwd: workDir,
    spawned,
    status,
    ok: spawned && status === 0,
    error: r.error ? String(r.error.message || r.error.code || r.error) : "",
    stderr: String(r.stderr || ""),
  };
}

// ONE diagnostic. S24 was a seat that saw 21 reds and no cause, so the
// shell, the probe it ran and what the shell wrote are all named.
// "shell failed" does not close it.
export function shellDiagnostic(p, sha) {
  const lines = [
    "grok landing gate: this shell cannot run the steps (exit " + EXIT_UNRUNNABLE + ")",
  ];
  lines.push("  shell   " + p.shell);
  lines.push("  probe   " + p.script);
  lines.push("  cwd     " + p.cwd);
  if (sha) lines.push("  commit  " + sha);
  lines.push(p.spawned ? "  exit    " + p.status : "  spawn   " + p.error);
  const err = String(p.stderr || "").trim();
  if (err) lines.push("  stderr  " + err.split(NL).join(NL + "          "));
  lines.push(
    "Steps run as `" +
      p.shell +
      " -e <file>` from that cwd. No step ran: this is not a verdict on the commit.",
  );
  return lines.join(NL);
}

// The gate's first act. null means the steps can run.
export function shellStop(shell, workDir, logDir, spawn = spawnSync, sha) {
  const probe = probeShell(shell, workDir, logDir, spawn);
  if (probe.ok) return null;
  return { code: EXIT_UNRUNNABLE, probe, text: shellDiagnostic(probe, sha) };
}

function git(args, opts = {}) {
  const r = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + " failed");
  return (r.stdout || "").trim();
}

// Is this file's own checkout a repository? The CLI resolves its commit
// from repoRoot, so a fixture that spawns the CLI proves nothing — and
// must not run — where the gate is unpacked from an archive without a
// .git. The self-test runs both ways.
function inRepo() {
  return spawnSync("git", ["-C", repoRoot, "rev-parse", "--git-dir"], { encoding: "utf8" }).status === 0;
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

// The verdict, and the status a caller sees. A failed step is
// EXIT_FAILED; the unrunnable shell is EXIT_UNRUNNABLE, and this is
// where the two stay apart.
export function verdict(results) {
  const failed = failures(results);
  return { code: failed.length ? EXIT_FAILED : 0, failed };
}

// One script per step, run through `<shell> -e <file>`, exit code
// captured and never piped away (T10, T14). `write` is injectable so a
// fixture can drive the steps without printing them.
export function runSteps(opts) {
  const { steps, workDir, logDir, shell = SHELL, spawn = spawnSync } = opts;
  const write = opts.write || ((s) => process.stdout.write(s));
  const results = [];
  for (const [i, step] of steps.entries()) {
    const n = String(i + 1).padStart(2, "0");
    if (!step.run) {
      write("  --  " + n + "  " + step.name + "  (no run)" + NL);
      results.push({ name: step.name, status: null });
      continue;
    }
    const sus = suspendedBy(workDir, step.name);
    write("  ..  " + n + "  " + step.name + " ... ");
    const scriptPath = join(logDir, n + ".sh");
    writeFileSync(scriptPath, step.run.endsWith("\n") ? step.run : step.run + "\n");
    const r = spawn(shell, ["-e", scriptPath], {
      cwd: workDir,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const status = r.status === null ? 1 : r.status;
    results.push({ name: step.name, status, suspended: sus ? sus.id : null });
    if (status === 0) {
      write(sus ? "ok — " + sus.id + " suspends it and it passes anyway" + NL : "ok" + NL);
    } else {
      write(sus ? "FAILED — suspended by " + sus.id + " until " + sus.expires + NL : "FAILED" + NL);
    }
    writeFileSync(join(logDir, n + ".txt"), (r.stdout || "") + (r.stderr || ""));
  }
  return results;
}

// ---- fixtures for the shell probe -----------------------------------
//
// One fixture per property, and each one can fail: a fixture that could
// not red proves nothing, and a fixture that reds for two properties
// leaves one of them untested (T79).
//
// A fixture's shell is either the real one or a STAND that answers the
// two forms the gate uses — `-e <file>` and `-c <string>` — so the WSL
// launcher (it takes a command string and cannot read a Windows path as
// a file) can be modelled where no such launcher is installed. The real
// launcher is checked too when this machine has one.

function fixtureDirs(tag) {
  const root = mkdtempSync(join(tmpdir(), "grok-gate-" + tag + "-"));
  const workDir = join(root, "work");
  const logDir = join(root, "logs");
  mkdirSync(workDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  return {
    workDir,
    logDir,
    // A launcher spawned with cwd = workDir can still hold it for a
    // moment. A temp dir left behind is not a gate failure; a self-test
    // that throws instead of reporting is.
    done: () => {
      removeTree(root);
    },
  };
}

// Removing a directory a fixture owns. F47's fixture 5 met EBUSY for
// real when a launcher still held the cwd, so a removal that cannot
// complete is REPORTED and this returns: a temp dir left behind is the
// platform's to clear, and a throw here would hide the real finding
// behind a cleanup error (T79). `rm` and `report` are injectable so a
// fixture can drive the failure path without waiting for the platform.
function removeTree(dir, opts = {}) {
  if (!dir) return "";
  const rm = opts.rm || rmSync;
  const report = opts.report || ((m) => console.error(m));
  try {
    rm(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
    return "";
  } catch (err) {
    const why = String(err.message || err);
    report("landingGate self-test: could not remove " + dir + " — " + why);
    return why;
  }
}

// A throwaway repository the fixture owns: `git init`, one commit
// holding this tool and its neighbour. The CLI resolves its commit from
// the DIRECTORY OF THE FILE IT WAS LAUNCHED FROM, so a fixture that
// spawns the shipped file must give it a repository of its own. From a
// checkout the tree already is one; where the gate unpacks its archive
// there is none, and a fixture that skipped there is exactly the hole
// F47's correction left open (S24). It never throws: a repository that
// cannot be created comes back as an `error` string, and the caller
// FAILS on that rather than passing quietly. `spawn` is injectable so a
// fixture can make creation fail on purpose.
function makeTempRepo(tag, opts = {}) {
  const spawn = opts.spawn || spawnSync;
  let dir = "";
  try {
    dir = mkdtempSync(join(tmpdir(), "grok-gate-" + tag + "-repo-"));
  } catch (err) {
    return { dir: "", tool: "", sha: "", error: "could not create the repository directory: " + String(err.message || err) };
  }
  const tool = join(dir, "factory", "tools", "landingGate.mjs");
  try {
    mkdirSync(join(dir, "factory", "tools"), { recursive: true });
    copyFileSync(fileURLToPath(import.meta.url), tool);
    copyFileSync(join(dirname(fileURLToPath(import.meta.url)), "experiment.mjs"), join(dir, "factory", "tools", "experiment.mjs"));
  } catch (err) {
    return { dir, tool, sha: "", error: "could not lay out the repository: " + String(err.message || err) };
  }
  const git = (args) => spawn("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const steps = [
    [["init", "-q"], "git init"],
    [["add", "-A"], "git add"],
    [
      ["-c", "user.email=fixture@example.invalid", "-c", "user.name=fixture", "-c", "commit.gpgsign=false", "commit", "--no-verify", "-m", "fixture"],
      "git commit",
    ],
  ];
  for (const [args, what] of steps) {
    const r = git(args);
    if (r.error || r.status !== 0) {
      const said = r.error ? String(r.error.message || r.error) : String(r.stderr || "").trim();
      return { dir, tool, sha: "", error: what + " failed: " + (said || "exit " + r.status) };
    }
  }
  const head = git(["rev-parse", "HEAD"]);
  const sha = head.status === 0 ? String(head.stdout || "").trim() : "";
  if (!sha) return { dir, tool, sha: "", error: "the throwaway repository has no commit to resolve" };
  return { dir, tool, sha, error: "" };
}

function stand(spec = {}) {
  const calls = [];
  const fn = (cmd, args, opts = {}) => {
    calls.push({ cmd, args: Array.from(args), cwd: opts.cwd });
    const status = args[0] === "-e" ? spec.onFile : spec.onCommand;
    return { status, stdout: "", stderr: status === 0 ? "" : String(spec.stderr || ""), error: undefined };
  };
  fn.calls = calls;
  return fn;
}

const WSL_LAUNCHER = "C:\\Windows\\System32\\bash.exe";
const NO_STEP_LINE = /\.\.\s+\d\d\s/;

function probeFixtures(errors) {
  fixture1(errors);
  fixture2(errors);
  fixture3(errors);
  fixture4(errors);
  fixture5(errors);
  fixture6(errors);
  fixture7(errors);
  fixture8(errors);
  fixture9(errors);
  fixture10(errors);
  fixture11(errors);
}

// 1 A shell that CAN run the steps changes nothing: all 21 run and a
//   green run comes back passed.
function fixture1(errors) {
  const d = fixtureDirs("f1");
  try {
    const stop = shellStop(SHELL, d.workDir, d.logDir, spawnSync, "f".repeat(40));
    if (stop) errors.push("[1 ordinary] a shell that can run the steps was refused: " + stop.text.split(NL)[0]);
    const steps = Array.from({ length: 21 }, (_, i) => ({ name: "passes " + (i + 1), run: "exit 0" }));
    const results = runSteps({ steps, workDir: d.workDir, logDir: d.logDir, write: () => {} });
    if (results.length !== 21) errors.push("[1 ordinary] " + results.length + " of 21 steps ran");
    if (results.some((r) => r.status !== 0)) errors.push("[1 ordinary] a passing step did not pass");
    if (verdict(results).code !== 0) errors.push("[1 ordinary] a green run did not come back passed");
  } finally {
    d.done();
  }
}

// 2 A command name that does not exist: the diagnostic, no step lines,
//   and the unrunnable status. The real spawn, so the real error.
function fixture2(errors) {
  const d = fixtureDirs("f2");
  try {
    const shell = "grok-no-such-shell-f47";
    const stop = shellStop(shell, d.workDir, d.logDir, spawnSync, "a".repeat(40));
    if (!stop) {
      errors.push("[2 not spawnable] a shell that cannot be spawned was accepted");
      return;
    }
    if (stop.code !== EXIT_UNRUNNABLE) {
      errors.push("[2 not spawnable] exit " + stop.code + ", not " + EXIT_UNRUNNABLE);
    }
    if (NO_STEP_LINE.test(stop.text)) errors.push("[2 not spawnable] the diagnostic carried step lines");
    if (!stop.text.includes(shell)) errors.push("[2 not spawnable] the diagnostic did not name the shell");
  } finally {
    d.done();
  }
}

// 3 A shell that CAN be spawned and then fails the probe. This is the
//   member most likely to escape: a check written against the spawn
//   error alone passes 2 and leaves this one open. Its stand fails
//   `-c` too, so the property-5 mutation cannot red it.
function fixture3(errors) {
  const d = fixtureDirs("f3");
  try {
    const sh = stand({ onFile: 3, onCommand: 3, stderr: "sh: cannot run a script here" });
    const stop = shellStop(SHELL, d.workDir, d.logDir, sh, "b".repeat(40));
    if (!stop) {
      errors.push("[3 spawned then failed] a shell that failed the probe was accepted");
      return;
    }
    if (stop.code !== EXIT_UNRUNNABLE) {
      errors.push("[3 spawned then failed] exit " + stop.code + ", not " + EXIT_UNRUNNABLE);
    }
    if (NO_STEP_LINE.test(stop.text)) {
      errors.push("[3 spawned then failed] the diagnostic carried step lines");
    }
  } finally {
    d.done();
  }
}

// 4 The diagnostic NAMES the shell and carries what the probe wrote to
//   stderr. Straight at the formatter, so a mutation of the gate's
//   decision cannot move it.
function fixture4(errors) {
  const d = fixtureDirs("f4");
  try {
    const wrote = "C:UsersaccesAppDataLocaltempgrok-gate-abc-logs00-probe.sh: No such file or directory";
    const p = probeShell(SHELL, d.workDir, d.logDir, stand({ onFile: 127, onCommand: 127, stderr: wrote }));
    const text = shellDiagnostic(p, "c".repeat(40));
    if (!text.includes(SHELL)) errors.push("[4 diagnostic] the diagnostic does not name the shell");
    if (!text.includes(wrote)) {
      errors.push("[4 diagnostic] the diagnostic does not carry what the shell wrote to stderr");
    }
    if (!text.includes(p.script)) errors.push("[4 diagnostic] the diagnostic does not name the probe it ran");
    if (NO_STEP_LINE.test(text)) errors.push("[4 diagnostic] the diagnostic carried step lines");
  } finally {
    d.done();
  }
}

// 5 The probe takes the STEP's own form. Under the WSL shape — `-c`
//   works, `-e <windows file>` does not — a probe shaped `bash -c true`
//   passes and the 21 reds come back (T09).
function fixture5(errors) {
  const d = fixtureDirs("f5");
  try {
    ownForm(errors, stand({ onFile: 1, onCommand: 0, stderr: "cannot read that file" }), SHELL, d);
    if (existsSync(WSL_LAUNCHER)) ownForm(errors, spawnSync, WSL_LAUNCHER, d);
  } finally {
    d.done();
  }
}

function ownForm(errors, spawn, shell, d) {
  const probe = probeShell(shell, d.workDir, d.logDir, spawn);
  if (probe.ok) {
    errors.push(
      "[5 own form] " + shell + " cannot take `-e <file>` and the probe passed anyway, so a `-c`-shaped probe passes here",
    );
  }
  const call = spawn.calls && spawn.calls[0];
  if (!call) return;
  if (call.args[0] !== "-e") {
    errors.push("[5 own form] the probe spawned `" + call.args.join(" ") + "`, not `-e <file>`");
  }
  if (dirname(String(call.args[1] || "")) !== d.logDir) {
    errors.push("[5 own form] the probe script is not a file in the log dir");
  }
  if (call.cwd !== d.workDir) errors.push("[5 own form] the probe did not run with the step's cwd");
}

// 6 A caller and a seat can tell "this shell cannot run the gate" from
//   "your commit is bad".
function fixture6(errors) {
  if (EXIT_UNRUNNABLE === 0) errors.push("[6 status] the unrunnable status is the passed status");
  if (EXIT_UNRUNNABLE === EXIT_FAILED) errors.push("[6 status] the unrunnable status is GATE FAILED's status");
  if (EXIT_FAILED !== 1) errors.push("[6 status] GATE FAILED is " + EXIT_FAILED + ", not 1");
  const v = verdict([{ name: "Fails", status: 1, suspended: null }]);
  if (v.code !== 1) errors.push("[6 status] a failed step comes back " + v.code + ", not 1");
}

// 7 THE SHIPPED FILE, spawned as the process a person runs. Fixtures 1-6
//   reach the library through its exports; nothing above the export line
//   is exercised, so the wiring a launch takes can be removed — `const
//   stop = null; void shellStop;` — with all six green and the gate
//   printing GATE PASSED, which is S24 still open (D-61: the red belongs
//   at the production entry point). GATE_SHELL is read by the CLI so this
//   fixture can drive it without editing the file.
//
//   The repository is the fixture's OWN (makeTempRepo). The CLI resolves
//   its commit from the directory of the file it was launched from, so
//   the copy inside that throwaway repository is what the child reads.
//   It therefore RUNS where the gate runs — step 15 unpacks the archive
//   into a directory that is not a repository — instead of skipping
//   there, which is what F47's correction did and what left the wiring
//   unwatched by the gate that protects main. A repository that cannot
//   be made is a FAILED fixture with its reason, never a quiet skip.
function fixture7(errors) {
  const shell = "grok-no-such-shell-f47";
  const repo = makeTempRepo("f7");
  try {
    if (repo.error) {
      errors.push("[7 entry point] the throwaway repository could not be created — " + repo.error);
      return;
    }
    // The fixture owns its input: the copy it laid down, not the file
    // in the tree it was launched from, so a checkout and a bare
    // directory (step 15) bring back the same verdict.
    const tool = repo.tool;
    if (resolve(tool) === resolve(fileURLToPath(import.meta.url))) {
      errors.push("[7 own copy] the fixture spawned the tree it runs from, not its own copy");
    }
    const r = spawnSync(process.execPath, [tool], {
      cwd: repo.dir,
      env: { ...process.env, GATE_SHELL: shell },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const out = String(r.stdout || "");
    const err = String(r.stderr || "");
    if (r.status !== EXIT_UNRUNNABLE) {
      errors.push(
        "[7 entry point] the CLI with GATE_SHELL=" + shell + " came back exit " + r.status + ", not " + EXIT_UNRUNNABLE,
      );
    }
    if (!err.includes("this shell cannot run the steps")) {
      errors.push("[7 entry point] the CLI printed no unrunnable-shell diagnostic");
    }
    if (!err.includes(shell)) {
      errors.push("[7 entry point] the diagnostic did not name the shell GATE_SHELL asked for");
    }
    if (NO_STEP_LINE.test(out) || NO_STEP_LINE.test(err)) {
      errors.push("[7 entry point] a step line was printed before the probe stopped the CLI");
    }
    // The child resolved the THROWAWAY repository's commit, not this
    // tree's: the diagnostic names that sha. A fixture that spawned the
    // launch tree's file would name the launch tree's.
    if (repo.sha && !err.includes(repo.sha)) {
      errors.push("[7 own copy] the child did not resolve the throwaway repository's commit");
    }
    // BEFORE it archives: the diagnostic names the cwd it probed in, and
    // that directory holds nothing — the commit was never unpacked into it.
    const m = /^[ \t]*cwd[ \t]+(.+?)[ \t\r]*$/m.exec(err);
    if (!m) {
      errors.push("[7 entry point] the diagnostic did not name the cwd it probed in");
      return;
    }
    const cwd = m[1];
    try {
      const unpacked = readdirSync(cwd).length;
      if (unpacked) {
        errors.push("[7 entry point] " + unpacked + " entries were unpacked before the probe stopped the CLI");
      }
    } catch {
      // the child's temp dir is already gone
    }
    removeTree(cwd);
    removeTree(cwd + "-logs");
  } finally {
    removeTree(repo.dir);
  }
  // The self-test leaves no repository behind. A leftover is reported
  // by the assertion below; removeTree above reports its own failure.
  if (existsSync(repo.dir)) {
    errors.push("[7 cleanup] the throwaway repository was left behind: " + repo.dir);
  }
}

// 8 A shell that cannot be SPAWNED keeps its cause. probeShell records
//   the spawn's own error and the diagnostic prints it as `spawn …`
//   rather than degrading to a bare `exit 1` — the invisibility S24 is
//   about. Fixture 2 asserts the verdict but not the cause, so before
//   this fixture `const spawned = true` in probeShell red nothing.
function fixture8(errors) {
  const d = fixtureDirs("f8");
  try {
    const shell = "grok-no-such-shell-f47-spawn";
    const p = probeShell(shell, d.workDir, d.logDir, spawnSync);
    if (p.spawned) {
      errors.push("[8 spawn cause] a shell that cannot be spawned read as spawned");
      return;
    }
    if (!p.error) {
      errors.push("[8 spawn cause] the probe recorded no cause for a spawn that failed");
      return;
    }
    const text = shellDiagnostic(p, "d".repeat(40));
    if (!/(^|\n)[ \t]*spawn[ \t]+/.test(text)) {
      errors.push("[8 spawn cause] the diagnostic says the shell failed but not that it could not be spawned");
    }
    if (!text.includes(p.error)) {
      errors.push("[8 spawn cause] the diagnostic does not carry the spawn's own error");
    }
  } finally {
    d.done();
  }
}

// 9 With GATE_SHELL unset — every ordinary launch, and the Action on
//   Ubuntu, which sets nothing — the gate spawns `bash`. The variable is
//   a new way for the default to drift, and this is what would catch it.
//   It asserts the resolved value: with a shell that works there is no
//   diagnostic in which to read the name back.
function fixture9(errors) {
  if (process.env.GATE_SHELL) return;
  if (SHELL !== "bash") {
    errors.push("[9 default] with GATE_SHELL unset the gate spawns `" + SHELL + "`, not `bash`");
  }
}

// 10 A throwaway repository that cannot be CREATED fails the self-test
//    with a message naming why; it never passes quietly as a skip. The
//    seam is makeTempRepo's git spawn, driven with a git that refuses, so
//    the failure this asserts is the one the fixture will really meet
//    (T79: the fixture can fail). fixture7 turns a non-empty `error`
//    into a self-test failure — this proves the error is populated and
//    carries the cause.
function fixture10(errors) {
  const refusing = () => ({ status: 1, stdout: "", stderr: "fatal: cannot init a repository here", error: undefined });
  const repo = makeTempRepo("f10", { spawn: refusing });
  try {
    if (!repo.error) {
      errors.push("[10 repo failure] a repository that could not be created reported no reason");
      return;
    }
    if (!/git init/.test(repo.error) || !/cannot init/.test(repo.error)) {
      errors.push("[10 repo failure] the reason does not name what failed: " + repo.error);
    }
  } finally {
    removeTree(repo.dir);
  }
}

// 11 A cleanup that cannot complete is REPORTED, not thrown. F47's
//    fixture 5 met EBUSY for real when a launcher still held the cwd, so
//    a throwing rm stands for a thing this machine has already done once.
//    removeTree must say so and return: a thrown cleanup error would hide
//    the finding the fixture was reporting.
function fixture11(errors) {
  const reports = [];
  removeTree("grok-gate-f11-never-created", {
    rm: () => {
      throw new Error("EBUSY: resource busy or locked, rmdir 'grok-gate-f11-never-created'");
    },
    report: (m) => reports.push(m),
  });
  if (!reports.length) {
    errors.push("[11 cleanup] a removal that failed was reported nowhere");
  } else if (!/EBUSY/.test(reports.join(" "))) {
    errors.push("[11 cleanup] the report did not carry what the removal said");
  }
}

function selfTestReport(errors, note) {
  if (errors.length) {
    console.error("landingGate self-test failed");
    for (const e of errors) console.error("  " + e);
    process.exit(EXIT_FAILED);
  }
  console.log("landingGate self-test ok" + (note ? " (" + note + ")" : ""));
  process.exit(0);
}

function selfTest() {
  // The gate must unpack on the platform the control plane actually runs
  // on. Proof is bytes out of the archive equal to bytes out of git.
  const errors = [];
  synthTest(errors);
  probeFixtures(errors);
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
  if (!inRepo()) selfTestReport(errors, "unpack only; no repository here");
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
  selfTestReport(errors, "");
}

if (process.argv.includes("--self-test")) selfTest();

const shaArg = process.argv.includes("--sha")
  ? process.argv[process.argv.indexOf("--sha") + 1]
  : "HEAD";

const sha = git(["rev-parse", shaArg]);
const short = sha.slice(0, 7);
const { workDir, logDir } = tempPair(short);

// The shell is probed before the first step, in the step's own form, and
// before anything is read out of the commit: a shell that cannot run the
// steps reds all 21 at any commit, and a seat reading step names cannot
// see why (S24). It names itself instead, and no step line is printed.
const stop = shellStop(SHELL, workDir, logDir, spawnSync, sha);
if (stop) {
  console.error(stop.text);
  process.exit(stop.code);
}

if (!archiveTo(sha, workDir)) {
  console.error("archive failed");
  process.exit(EXIT_FAILED);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(workDir, "factory/landing-checks.json"), "utf8"));
} catch (err) {
  console.error("commit", sha, "has no parseable factory/landing-checks.json");
  console.error(String(err.message || err));
  console.error("The gate does not fall back to this tree.");
  process.exit(EXIT_FAILED);
}

const steps = Array.isArray(manifest.steps) ? manifest.steps : [];

console.log("grok landing gate");
console.log("  commit   " + sha);
console.log("  archive  " + workDir);
console.log("  steps    " + steps.length);
console.log("");

const results = runSteps({ steps, workDir, logDir, shell: SHELL });

const { code, failed } = verdict(results);
const suspended = results.filter((r) => r.suspended && r.status !== 0);
console.log("");
for (const s of suspended) {
  console.log("  suspended  " + s.name + " failed under " + s.suspended + " — kept out of the verdict");
}
if (suspended.length) console.log("  logs       " + logDir);
if (code === 0) {
  rmSync(workDir, { recursive: true, force: true });
  if (!suspended.length) rmSync(logDir, { recursive: true, force: true });
  console.log(suspended.length ? "GATE PASSED with " + suspended.length + " suspended" : "GATE PASSED");
  process.exit(0);
}
console.log("GATE FAILED");
for (const f of failed) console.log("  " + f.name + " exit " + f.status);
console.log("  archive " + workDir);
process.exit(EXIT_FAILED);
