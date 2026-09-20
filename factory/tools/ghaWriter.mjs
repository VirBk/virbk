#!/usr/bin/env node
// GitHub Action writer runner. Hands, not judgment. Does not call a model
// itself; it launches qwen-code. Idle is success. Missing secret is a loud
// skip, not a red badge. Never pushes main.
//
//   node factory/tools/ghaWriter.mjs watch
//   node factory/tools/ghaWriter.mjs run
//   node factory/tools/ghaWriter.mjs run --dry-run    # print the plan, launch nothing
//   node factory/tools/ghaWriter.mjs run --spawner <module>   # replace the spawner (self-test)
//   node factory/tools/ghaWriter.mjs --self-test
//
// The router (factory/tools/route.mjs) is the one answer: path, base URL, key
// NAME, model id. This file obeys that answer and keeps no copy of it (T29,
// T48). The prompt travels on stdin, never as an argv string (T72).
//
// The child's env and argv are built in one place, launchSeat, and the spawner
// is a parameter of it (seat.mjs `census --lister` style). The self-test
// replaces the spawner and reads what the child was actually handed, so the
// code an assertion covers is the code that ships.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, resolveNow } from "./route.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

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

function assertNotMain(ref) {
  const name = String(ref || "").replace(/^refs\/heads\//, "");
  if (!name || name === "main" || name === "master") {
    fail("refused", ["never push main"]);
  }
  if (!/^writer\/F\d+$/i.test(name)) {
    fail("refused", ["branch must be writer/<lane>: " + name]);
  }
}

// The key the router names is the key counted and the key passed: one answer,
// one value. A count of one key and a pass of another is a loud failure wearing
// a skip's clothes (T55).
function writerKey(answer, env = process.env) {
  return String(env[answer.key] || "").trim();
}

function launchSpec(answer, prompt, lane) {
  const branch = "writer/" + lane;
  assertNotMain(branch);
  const args = ["--auth-type", "openai", "--model", answer.providerModel, "--yolo", "-p", "-"];
  return {
    lane,
    branch,
    path: answer.path,
    reason: answer.reason,
    base: answer.base,
    keyName: answer.key,
    keyPresent: writerKey(answer) !== "",
    model: answer.providerModel,
    command: "qwen",
    args,
    argvBytes: Buffer.byteLength(args.join(" "), "utf8"),
    stdinBytes: Buffer.byteLength(prompt, "utf8"),
  };
}

// The child is handed the router's answer and the packet, and nothing else:
// base URL, key VALUE and model id into the env, the prompt on stdin (T72).
// The runner chooses nothing here (T29). One builder, so a fixture that
// replaces the spawner observes the same env and argv the cloud job sends.
function launchSeat(answer, spec, prompt, spawn = spawnSync) {
  const env = {
    ...process.env,
    OPENAI_BASE_URL: spec.base,
    OPENAI_API_KEY: writerKey(answer),
    OPENAI_MODEL: spec.model,
  };
  return spawn("qwen", spec.args, {
    cwd: root,
    encoding: "utf8",
    env,
    input: prompt,
    maxBuffer: 32 * 1024 * 1024,
  });
}

// The launch seam: `run --spawner <module>` replaces spawnSync with the
// module's default export. The cloud job passes no --spawner and gets the real
// one; the self-test passes a recorder and sees what the child would get.
async function spawnerFrom(argv) {
  const i = argv.indexOf("--spawner");
  if (i < 0) return spawnSync;
  const file = argv[i + 1];
  if (!file) fail("refused", ["--spawner needs a module path"]);
  const mod = await import(pathToFileURL(pathResolve(file)).href);
  const fn = mod.default || mod.spawn;
  if (typeof fn !== "function") fail("refused", ["--spawner module exports no spawn function"]);
  return fn;
}

// The cloud job's guard, read as a condition and evaluated rather than
// pattern-matched: unset, empty and "off" must all leave the seat unlaunched.
// A guard checked by looking for the text that is supposed to be there agrees
// with itself (D-59).
function cloudGuard(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const jobs = lines.findIndex((l) => l === "jobs:");
  if (jobs < 0) return "";
  for (let i = jobs + 1; i < lines.length; i++) {
    const m = /^ {4}if:\s*(.+?)\s*$/.exec(lines[i]);
    if (m) return m[1];
    if (/^\S/.test(lines[i])) break;
  }
  return "";
}

function guardAllows(expr, vars) {
  let js = String(expr || "").trim();
  const braced = /^\$\{\{\s*([\s\S]*?)\s*\}\}$/.exec(js);
  if (braced) js = braced[1];
  js = js.replace(/\bvars\.([A-Za-z_][A-Za-z0-9_]*)\b/g, 'vars["$1"]');
  try {
    return Boolean(new Function("vars", '"use strict"; return (' + js + ");")(vars));
  } catch {
    return null;
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
  const dryRun = process.argv.includes("--dry-run");
  const list = lanes();
  if (!list.length) {
    console.log("idle");
    process.exit(0);
  }
  const lane = list[0];
  const answer = await resolveNow();
  if (!writerKey(answer)) {
    // Loud, named, and not a failure: the secret was never placed here.
    console.log(
      "skip loudly: writer secret missing: " + answer.key + " for path " + answer.path + " (" + answer.reason + ")",
    );
    console.log("skip loudly: nothing was launched and this is not a job failure (T55)");
    process.exit(0);
  }
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
  const spec = launchSpec(answer, prompt, lane);
  const branch = spec.branch;
  if (dryRun) {
    console.log(JSON.stringify(spec));
    process.exit(0);
  }
  const spawn = await spawnerFrom(process.argv);
  console.log("# prompt " + (prompt === envelope ? "envelope only (packet failed)" : "packet") + " " + spec.stdinBytes + " bytes");
  console.log("# lane " + lane);
  console.log(
    "# route " + spec.path + " (" + spec.reason + ") base " + spec.base + " key " + spec.keyName + " model " + spec.model,
  );
  console.log("# branch " + branch);
  const qwen = spawn("qwen", ["--version"], { encoding: "utf8" });
  if (qwen.status !== 0) {
    fail("qwen-code missing", ["npm install -g @qwen-code/qwen-code"]);
  }
  git(["config", "user.email", "199931366+VirBk@users.noreply.github.com"]);
  git(["config", "user.name", "VirBk"]);
  git(["checkout", "-B", branch]);
  const write = launchSeat(answer, spec, prompt, spawn);
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
  const writer = readFileSync(join(root, ".github/workflows/writer.yml"), "utf8");
  const landing = readFileSync(join(root, ".github/workflows/landing.yml"), "utf8");
  const src = readFileSync(join(root, "factory/tools/ghaWriter.mjs"), "utf8");
  const spec = JSON.parse(readFileSync(join(root, "factory/writer-paths.json"), "utf8"));
  const picks = JSON.parse(readFileSync(join(root, "factory/project.json"), "utf8"));

  if (/DASHSCOPE_API_KEY|DEEPSEEK_API_KEY/.test(landing)) {
    errors.push("landing.yml must not name writer secrets");
  }

  // The cloud job is opt-in and idle is the default. The guard is evaluated
  // under the values a repository actually has, not searched for as text.
  const guard = cloudGuard(writer);
  if (!guard) {
    errors.push("writer.yml launches the cloud seat with no guard; unset must stay idle");
  } else {
    for (const [vars, expected] of [
      [{}, false],
      [{ CLOUD_WRITER: "" }, false],
      [{ CLOUD_WRITER: "off" }, false],
      [{ CLOUD_WRITER: "on" }, true],
    ]) {
      const got = guardAllows(guard, vars);
      if (got === null) {
        errors.push("the writer.yml guard is not evaluable: " + guard);
      } else if (got !== expected) {
        errors.push(
          "guard " + guard + " with vars " + (JSON.stringify(vars) || "{}") + ": got " + got + " want " + expected,
        );
      }
    }
  }

  if (!/secrets\.DASHSCOPE_API_KEY/.test(writer)) {
    errors.push("writer.yml must map secrets.DASHSCOPE_API_KEY");
  }
  // Every key NAME the router can answer with must reach the job.
  const at = new Date("2026-09-18T11:00:00Z");
  for (const keyName of new Set([
    resolve({ ...picks, writerPath: "dashscope" }, spec, at, true).key,
    resolve({ ...picks, writerPath: "native" }, spec, at, true).key,
  ])) {
    if (!writer.includes("secrets." + keyName)) {
      errors.push("writer.yml does not map secrets." + keyName + ", which the router can name");
    }
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

  // The route below the router is driven through the CLI a runner runs, against
  // a fixture tree, with the clock and native health pinned so no probe and no
  // live envelope moves the answer under the test (T04, T13).
  const fixture = mkdtempSync(join(tmpdir(), "grok-gha-"));
  const bare = mkdtempSync(join(tmpdir(), "grok-gha-bare-"));
  const fx = (...p) => join(fixture, ...p);
  try {
    mkdirSync(fx("factory", "envelopes"), { recursive: true });
    mkdirSync(fx("factory", "tools"), { recursive: true });
    for (const rel of ["factory/tools/ghaWriter.mjs", "factory/tools/route.mjs", "factory/writer-paths.json"]) {
      copyFileSync(join(root, rel), fx(rel));
    }
    writeFileSync(
      fx("factory", "project.json"),
      JSON.stringify({ writerModel: "deepseek-flash", writerPath: "auto" }, null, 2) + "\n",
    );
    const envelope = "# ENVELOPE: F99 — fixture lane\n\n" + "a fixture line for the stdin check\n".repeat(130) + "\n";
    writeFileSync(fx("factory", "envelopes", "F99.md"), envelope);

    // watch's property, not the tree's state: idle when nothing is live, issued
    // when something is. The gate runs this file from an archive taken before
    // the lane's own envelope is deleted, so an assertion about the live tree
    // could never pass (T13). Both directions are driven here.
    mkdirSync(join(bare, "factory", "tools"), { recursive: true });
    for (const rel of ["factory/tools/ghaWriter.mjs", "factory/tools/route.mjs"]) {
      copyFileSync(join(root, rel), join(bare, rel));
    }
    const secret = "sk-fixture-not-a-real-key";
    const cleanEnv = (extra) => {
      const e = { ...process.env, ROUTE_NOW: "2026-09-18T11:00:00Z" };
      for (const k of [
        "DEEPSEEK_API_KEY",
        "DASHSCOPE_API_KEY",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "OPENAI_MODEL",
        "ROUTE_NATIVE",
      ]) {
        delete e[k];
      }
      return Object.assign(e, extra);
    };
    const drive = (args, extra) =>
      spawnSync(process.execPath, [fx("factory", "tools", "ghaWriter.mjs"), ...args], {
        cwd: fixture,
        encoding: "utf8",
        env: cleanEnv(extra),
      });
    const planOf = (r) => {
      try {
        return JSON.parse(
          (r.stdout || "")
            .trim()
            .split("\n")
            .filter(Boolean)
            .pop(),
        );
      } catch {
        return null;
      }
    };

    // A live envelope: watch issues it. No envelope: watch idles. Both from the
    // runner's own CLI, neither from the tree this file happens to sit in.
    const issued = drive(["watch"]);
    if ((issued.stdout || "").trim() !== "issued F99") {
      errors.push("watch with a live envelope should print issued F99, got " + JSON.stringify(issued.stdout));
    }
    const idle = spawnSync(process.execPath, [join(bare, "factory", "tools", "ghaWriter.mjs"), "watch"], {
      cwd: bare,
      encoding: "utf8",
    });
    if ((idle.stdout || "").trim() !== "idle") {
      errors.push("watch with no envelope should print idle, got " + JSON.stringify(idle.stdout));
    }

    // The cloud seat takes the router's answer: off-peak healthy native stays
    // native, base, key name and id included.
    const native = drive(["run", "--dry-run"], { ROUTE_NATIVE: "up", DEEPSEEK_API_KEY: secret });
    const a = planOf(native);
    if (!a) {
      errors.push("native plan: run --dry-run printed no plan: " + JSON.stringify((native.stdout || "").slice(0, 200)));
    } else {
      if (a.base !== spec.bases.native) errors.push("native plan base " + a.base + " want " + spec.bases.native);
      if (a.keyName !== "DEEPSEEK_API_KEY") errors.push("native plan key name " + a.keyName);
      if (a.model !== "deepseek-flash") errors.push("native plan model " + a.model + " want the native id deepseek-flash");
      if (a.branch !== "writer/F99") errors.push("native plan branch " + a.branch);
      if (a.keyPresent !== true) errors.push("native plan keyPresent " + a.keyPresent);
      if (a.args[a.args.indexOf("-p") + 1] !== "-") {
        errors.push("the prompt carrier is not stdin: " + JSON.stringify(a.args).slice(0, 200));
      }
      const want = Buffer.byteLength(envelope, "utf8");
      if (a.stdinBytes !== want) errors.push("plan stdin " + a.stdinBytes + " bytes, want the prompt's " + want);
      if (a.argvBytes > 512) errors.push("the plan carries " + a.argvBytes + " bytes of argv");
      const fat = a.args.find((x) => Buffer.byteLength(x, "utf8") > 80);
      if (fat) errors.push("an argv element is longer than a flag: " + fat.slice(0, 40));
    }
    if ((native.stdout || "").includes(secret)) errors.push("the plan printed the secret value");

    // Native unhealthy fails over to DashScope, and the id it sends is the one
    // that base knows (T48), not the native catalog name.
    const hosted = drive(["run", "--dry-run"], { ROUTE_NATIVE: "down", DASHSCOPE_API_KEY: secret });
    const b = planOf(hosted);
    if (!b) {
      errors.push("hosted plan: run --dry-run printed no plan: " + JSON.stringify((hosted.stdout || "").slice(0, 200)));
    } else {
      if (b.base !== spec.bases.dashscope) errors.push("hosted plan base " + b.base);
      if (b.keyName !== "DASHSCOPE_API_KEY") errors.push("hosted plan key name " + b.keyName);
      if (b.model !== "deepseek-v4.1-flash") errors.push("hosted plan model " + b.model + " want the DashScope id");
    }

    // A missing secret is a loud skip that exits 0, naming the key its own path
    // would have used.
    const skipNative = drive(["run"], { ROUTE_NATIVE: "up" });
    if (skipNative.status !== 0) errors.push("a missing writer key must not fail the job: rc " + skipNative.status);
    if (!/writer secret missing/.test(skipNative.stdout || "")) {
      errors.push("the native skip did not say why: " + JSON.stringify((skipNative.stdout || "").slice(0, 160)));
    }
    if (!(skipNative.stdout || "").includes("DEEPSEEK_API_KEY")) {
      errors.push("the native skip did not name DEEPSEEK_API_KEY, the key the native call passes");
    }
    const skipHosted = drive(["run"], { ROUTE_NATIVE: "down" });
    if (skipHosted.status !== 0) errors.push("a missing writer key must not fail the job: rc " + skipHosted.status);
    if (!(skipHosted.stdout || "").includes("DASHSCOPE_API_KEY")) {
      errors.push("the dashscope skip did not name DASHSCOPE_API_KEY");
    }

    // The key the call does not pass must not buy a launch.
    const wrongKey = drive(["run", "--dry-run"], { ROUTE_NATIVE: "up", DASHSCOPE_API_KEY: secret });
    if (planOf(wrongKey)) errors.push("a DashScope key launched a native seat: run --dry-run printed a plan");
    if (wrongKey.status !== 0) errors.push("the wrong-key skip must exit 0: rc " + wrongKey.status);
    if (!(wrongKey.stdout || "").includes("DEEPSEEK_API_KEY")) {
      errors.push("the wrong-key skip did not name DEEPSEEK_API_KEY");
    }

    // The launch itself, through the entry point the Action runs, with the
    // spawner replaced by a recorder. This asserts what the child is handed:
    // base URL, key VALUE, model id, argv shape, and the packet on stdin rather
    // than in argv (T72). The plan above is a plan; this is the send.
    writeFileSync(
      fx("spawner.mjs"),
      [
        'import { appendFileSync } from "node:fs";',
        "export default function spawn(cmd, args, opts = {}) {",
        '  if (args.includes("--version")) return { status: 0, stdout: "9.9.9", stderr: "" };',
        "  appendFileSync(process.env.GHA_TEST_RECORD, JSON.stringify({",
        "    cmd,",
        "    args,",
        "    inputIsString: typeof opts.input === \"string\",",
        "    input: typeof opts.input === \"string\" ? opts.input : null,",
        "    env: {",
        "      OPENAI_BASE_URL: opts.env.OPENAI_BASE_URL,",
        "      OPENAI_API_KEY: opts.env.OPENAI_API_KEY,",
        "      OPENAI_MODEL: opts.env.OPENAI_MODEL,",
        "    },",
        '  }) + "\\n");',
        '  return { status: 0, stdout: "", stderr: "" };',
        "}",
        "",
      ].join("\n"),
    );
    const launch = drive(["run", "--spawner", fx("spawner.mjs")], {
      ROUTE_NATIVE: "up",
      DEEPSEEK_API_KEY: secret,
      GHA_TEST_RECORD: fx("record.jsonl"),
      // git() runs in the fixture's own root; this keeps a stray ancestor
      // repository from turning the drive into a commit.
      GIT_CEILING_DIRECTORIES: tmpdir(),
    });
    let rec = null;
    try {
      rec = JSON.parse(readFileSync(fx("record.jsonl"), "utf8").trim().split("\n").pop());
    } catch {
      /* reported below */
    }
    if (!rec) {
      errors.push("run --spawner drove no child: the launch record is missing");
    } else {
      if (rec.cmd !== "qwen") errors.push("the child command is " + rec.cmd);
      if (rec.env.OPENAI_BASE_URL !== spec.bases.native) {
        errors.push("the child's OPENAI_BASE_URL is " + rec.env.OPENAI_BASE_URL + " want " + spec.bases.native);
      }
      if (rec.env.OPENAI_API_KEY !== secret) {
        errors.push("the child's OPENAI_API_KEY is not the key value the router named");
      }
      if (rec.env.OPENAI_MODEL !== "deepseek-flash") {
        errors.push("the child's OPENAI_MODEL is " + rec.env.OPENAI_MODEL + " want deepseek-flash");
      }
      if (rec.args[rec.args.indexOf("-p") + 1] !== "-") {
        errors.push("the child's argv does not carry -p -: " + JSON.stringify(rec.args));
      }
      const carrier = (rec.args || []).find(
        (x) => typeof x === "string" && (x.includes("envelope") || x.includes("fixture line") || x.includes("\n")),
      );
      if (carrier) errors.push("an argv element carries the packet: " + String(carrier).slice(0, 40));
      if (rec.inputIsString !== true) errors.push("the packet does not arrive on stdin");
      if (rec.input !== envelope) errors.push("the child's stdin is not the packet's bytes");
      if ((launch.stdout || "").includes(secret)) errors.push("the launch printed the secret value");
    }
    if (launch.status !== 0) errors.push("the driven launch must exit 0, got rc " + launch.status);
  } finally {
    for (const dir of [fixture, bare]) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* the fixture is in the temp dir; a lock is not a test failure */
      }
    }
  }

  if (errors.length) fail("self-test failed", errors);
  console.log("self-test ok");
  process.exit(0);
}

console.error("usage: node factory/tools/ghaWriter.mjs watch|run|--self-test");
process.exit(1);
