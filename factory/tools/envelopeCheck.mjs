#!/usr/bin/env node
// The force a correction envelope must authorise, and the force no envelope may.
//
//   node factory/tools/envelopeCheck.mjs [--dir <kit root>]   the live check
//   node factory/tools/envelopeCheck.mjs --self-test          thirteen clauses, nine properties
//
// Why the clause exists (S26). T81 makes a seat read its envelope out of its own
// worktree and refuse when that copy differs from live main, so a correction is
// written to main and the seat's worktree is REBASED before it is relaunched.
// That rebase diverges the lane branch from the tip the seat already pushed, and
// AGENTS section 3 says only "push the branch only" - nothing authorises the
// force-with-lease that then needs. F44's seat met it, refused to rewrite a
// shared ref on its own authority and handed the call up; a control plane
// finished that return by hand. So a correction envelope carries the
// authorisation in its own text, for its OWN lane branch, and a sentence saying
// main is never forced. Nothing in this repository read
// factory/templates/ENVELOPE.md before this file, so the rule and the check
// arrive together (T24).
//
// A correction marks itself with CORRECTION in the title position of its first
// line: "ENVELOPE: F47 - CORRECTION 1 - <title>". A title sentence that merely
// mentions a correction is not a correction envelope - F49's own first line
// reads "A correction envelope authorises the force its own rebase forces", and
// the loose reading would demand a clause of the envelope that defines the rule.
//
// This file reads text. It calls no git and needs no repository: the landing
// gate runs it from an unpacked archive, where there is no .git at all. The
// check path above MARKER runs no program.
//
// The check runs only when this file is the process entry point (isEntry at the
// bottom), the guard packet.mjs in this directory carries. Without it, an import
// of ANY export ran the live check against the kit root this file derives from
// its own location and called process.exit, killing the importing script before
// its own code ran; F49's reviewer worked around it with a stripped copy.
//
// A correction whose clause names ANOTHER lane's branch is not a correction with
// no clause, and the summary names which one was found. One label for both sent
// a reader after a clause that was on the page.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { envelopes } from "./packet.mjs";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);

const HEAD = /^ENVELOPE:\s*([A-Za-z0-9][A-Za-z0-9._-]*)/;
const PUSH = /\bgit\s+push\b(.*)$/i;
const FORCE_FLAG = /^--force(-with-lease)?(=[^\s]*)?$/;
const MAIN_REF = "main";

function firstLine(text) {
  return text.split(NL)[0] || "";
}

export function laneOf(text) {
  const m = HEAD.exec(firstLine(text));
  return m ? m[1] : null;
}

// The marker is the word in the TITLE position, not anywhere on the line.
export function isCorrection(text) {
  const rest = firstLine(text).replace(HEAD, "").trim().replace(/^[\u2014\u2013-]+\s*/, "");
  return /^CORRECTION\b/i.test(rest);
}

function normaliseRef(ref) {
  return String(ref || "").trim().replace(/^refs\/heads\//, "");
}

// Every force-push command on the page, with the branches it names. The flag is
// read anywhere in the argument list, the first non-flag argument is the remote
// and the rest are refspecs, whose DESTINATION is what the force acts on:
// git push [flags] <remote> <src>:<dst>. No refspec names nothing, which is its
// own answer below.
export function forcePushes(text) {
  const out = [];
  text.split(NL).forEach((line, i) => {
    const m = PUSH.exec(line);
    if (!m) return;
    const args = m[1].split(/[\s;]+/).filter(Boolean);
    const flags = args.filter((a) => FORCE_FLAG.test(a));
    if (!flags.length) return;
    const positional = args.filter((a) => !a.startsWith("-"));
    out.push({
      line: i + 1,
      flag: flags[0].startsWith("--force-with-lease") ? "--force-with-lease" : "--force",
      targets: positional.slice(1).map((spec) => normaliseRef(spec.split(":").pop())),
    });
  });
  return out;
}

// A sentence that says main is never forced. Sentences, not lines: the sentence
// carries the fact, and a lone force flag elsewhere on the page satisfies none
// of this.
export function mainSafeSentences(text) {
  return text
    .split(NL)
    .flatMap((line) => line.split(/\.\s+/))
    .filter((s) => /\bmain\b/i.test(s) && /\bforc/i.test(s) && /\b(never|not|no)\b/i.test(s));
}

export function checkEnvelope(file, text) {
  const errors = [];
  const lane = laneOf(text);
  const correction = isCorrection(text);
  const pushes = forcePushes(text);
  // `clause` answers "does this envelope authorise its own lane's force"; `found`
  // carries the branch a wrong clause named, so the summary can tell the two
  // apart. A correction with a clause for someone else has clause false AND
  // found set.
  const record = { file, lane, correction, clause: false, branch: null, found: null };

  if (!lane) {
    errors.push(file + ": line 1 names no lane — an envelope starts with ENVELOPE: <LANE>");
  }

  // No envelope of either kind may authorise a force on main. This runs
  // whatever else the page carries, including a correct clause.
  for (const p of pushes) {
    if (!p.targets.length) {
      errors.push(
        file + ": line " + p.line + " authorises " + p.flag + " on no branch — " +
        "a force that names no branch rewrites whatever is checked out, main included",
      );
    }
    if (p.targets.includes(MAIN_REF)) {
      errors.push(file + ": line " + p.line + " authorises " + p.flag + " on main — main is never forced");
    }
  }

  if (correction && lane) {
    const own = "writer/" + lane;
    const leases = pushes.filter((p) => p.flag === "--force-with-lease");
    const mine = leases.find((p) => p.targets.includes(own));
    if (mine) {
      record.clause = true;
      record.branch = own;
      if (!mainSafeSentences(text).length) {
        errors.push(
          file + ": lane " + lane + " authorises " + own +
          " but carries no sentence saying main is never forced",
        );
      }
    } else if (leases.length) {
      record.found = leases[0].targets.join(", ");
      errors.push(
        file + ": the force authorisation names " + leases[0].targets.join(", ") +
        ", not this lane's " + own + " — a correction envelope is written by copying the last one",
      );
    } else {
      errors.push(
        file + ": correction lane " + lane + " carries no force-with-lease authorisation for " + own +
        " — the rebase T81 forces diverges the branch it already pushed",
      );
    }
  }
  return { errors, record };
}

// The directory is named, so an absent one is not read as an empty one (T09).
export function checkDir(root) {
  const errors = [];
  const records = [];
  const dir = join(root, "factory/envelopes");
  if (!existsSync(dir)) {
    errors.push(dir + ": no such directory — a directory that does not exist is not an empty one");
    return { root, dir, files: [], records, errors, envelopes: 0, corrections: 0 };
  }
  const files = envelopes(root);
  for (const file of files) {
    const { errors: e, record } = checkEnvelope(file, readFileSync(join(dir, file), "utf8"));
    records.push(record);
    errors.push(...e);
  }
  return {
    root,
    dir,
    files,
    records,
    errors,
    envelopes: records.length,
    corrections: records.filter((r) => r.correction).length,
  };
}

export function render(res) {
  const out = ["envelopes in " + res.dir + " — " + res.envelopes + " envelope(s) examined"];
  for (const r of res.records) {
    // Three answers, not two: a clause authorising this lane, a clause found
    // that authorises another branch (the summary names it), and no clause.
    const verdict = r.clause
      ? "lane " + r.lane + ": force-with-lease on " + r.branch
      : r.correction
        ? r.found
          ? "correction with a clause for " + r.found + ", not this lane's writer/" + r.lane
          : "correction with no clause found"
        : "no clause required";
    out.push("  envelope " + r.file + " — " + verdict);
  }
  for (const e of res.errors) out.push("  " + e);
  out.push(
    res.errors.length
      ? "envelope check failed — " + res.errors.length + " error(s)"
      : "envelope check ok — " + res.envelopes + " envelope(s), " + res.corrections + " correction(s)",
  );
  return out.join(NL);
}

// ---- self-test fixtures and mutations below this line; the check path ends here ----

const MARKER = "fixtures and mutations below this line";
// The guard fixtures run a child process, and the "check path runs no program"
// clause scans exactly the region above MARKER, so this binding sits below it.
// ESM hoists a top-level import whatever its position.
import { spawnSync } from "node:child_process";

const CORRECTION_HEAD = "ENVELOPE: F49 — CORRECTION 1 — a lesson gets a check";
const ORDINARY_HEAD = "ENVELOPE: F52 — a lane that is not a correction";
const SAFE = "main is never forced and no other branch is yours to rewrite.";

function clause(head, branch, opts = {}) {
  return [
    head,
    "Authorization: this envelope, issued by the control plane.",
    "",
    "Holds",
    "  factory/tools/envelopeCheck.mjs",
    "",
    "Pushing after a correction",
    "  The rebase has diverged your branch from the tip you pushed. You are authorised to run",
    "    git push --force-with-lease origin " + branch,
    "  on YOUR LANE BRANCH ONLY. " + (opts.safe === false ? "Stop after that." : SAFE),
    "",
  ].join(NL);
}

// Each fixture's `wants` holds only facts its OWN property owns: a clause that
// asserts another property's output reds under that property's mutation too, and
// then no mutation proves any one property (D-62). `errors` is the count, and a
// fixture that expects no error still asserts the count and the verdict text, so
// a file that was never examined cannot pass as a file that was examined and
// found clean. `refuse` holds text the fixture must NOT print — the half of a
// two-answer property that says which of the two answers this one is.
const FIXTURES = [
  {
    tag: "P1 own clause", prop: 1, expect: "pass", errors: 0,
    files: { "F49.md": clause(CORRECTION_HEAD, "writer/F49") },
    wants: [/1 envelope\(s\) examined/, /lane F49: force-with-lease on writer\/F49/],
  },
  {
    tag: "P2 no clause", prop: 2, expect: "fail", errors: 1,
    files: { "F49.md": CORRECTION_HEAD + NL + "Holds" + NL + "  factory/tools/envelopeCheck.mjs" + NL },
    wants: [/correction with no clause found/, /carries no force-with-lease authorisation for writer\/F49/],
    refuse: [/correction with a clause for/],
  },
  {
    tag: "P2b no main sentence", prop: 2, expect: "fail", errors: 1,
    files: { "F49.md": clause(CORRECTION_HEAD, "writer/F49", { safe: false }) },
    wants: [/no sentence saying main is never forced/],
  },
  {
    tag: "P3 foreign branch", prop: 3, expect: "fail", errors: 2,
    files: {
      "F49.md": clause(CORRECTION_HEAD, "writer/F48"),
      "F50.md": clause("ENVELOPE: F50 — CORRECTION 1 — copied from the template", "writer/<LANE>"),
    },
    wants: [
      /the force authorisation names writer\/F48, not this lane's writer\/F49/,
      /the force authorisation names writer\/<LANE>, not this lane's writer\/F50/,
    ],
  },
  {
    tag: "P4 ordinary", prop: 4, expect: "pass", errors: 0,
    files: { "F52.md": ORDINARY_HEAD + NL + "Holds" + NL + "  factory/tools/envelopeCheck.mjs" + NL },
    wants: [/envelope F52\.md — no clause required/, /1 envelope\(s\), 0 correction\(s\)/],
  },
  {
    tag: "P5 force on main", prop: 5, expect: "fail", errors: 1,
    files: {
      "F49.md": clause(CORRECTION_HEAD, "writer/F49") + "  git push --force origin main" + NL,
    },
    wants: [/authorises --force on main — main is never forced/],
  },
  {
    tag: "P5b unnamed force", prop: 5, expect: "fail", errors: 1,
    files: { "F49.md": clause(CORRECTION_HEAD, "writer/F49") + "  git push --force" + NL },
    wants: [/authorises --force on no branch/],
  },
  { tag: "P6a empty directory", prop: 6, kind: "empty" },
  { tag: "P6b absent directory", prop: 6, kind: "absent" },
  { tag: "P6c the check path runs no program", prop: 6, kind: "source" },
  {
    // A clause WAS found, and it names writer/F48. The summary must say so; the
    // no-clause verdict is the one answer this page does not have.
    tag: "P7 wrong-branch summary", prop: 7, expect: "fail", errors: 1,
    files: { "F49.md": clause(CORRECTION_HEAD, "writer/F48") },
    wants: [/correction with a clause for writer\/F48, not this lane's writer\/F49/],
    refuse: [/correction with no clause found/],
  },
  { tag: "P8 import runs nothing", prop: 8, kind: "import" },
  { tag: "P9 the live run as a command", prop: 9, kind: "cli" },
];

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "grok-envelope-"));
}

function build(root, files) {
  const dir = join(root, "factory/envelopes");
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

function runFixture(f) {
  if (f.kind === "empty") {
    const root = tempRoot();
    try {
      build(root, {});
      const res = checkDir(root);
      const text = render(res);
      return { text, ok: res.errors.length === 0 && /0 envelope\(s\) examined/.test(text) && /0 correction\(s\)/.test(text) };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  if (f.kind === "absent") {
    const root = tempRoot();
    try {
      const res = checkDir(root);
      const text = render(res);
      return {
        text,
        ok: res.errors.length === 1 && /no such directory — a directory that does not exist is not an empty one/.test(text),
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  if (f.kind === "source") {
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const checkPath = src.split(MARKER)[0].replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    // RegExp.prototype.exec is not a process. Only the spawn APIs count.
    const hit = /\b(child_process|spawn|spawnSync|execSync|execFile|fork)\b/.exec(checkPath);
    return {
      text: "the check path above the marker " + (hit ? "runs " + hit[1] : "runs no program"),
      ok: !hit,
    };
  }
  if (f.kind === "import") {
    // A real child process, because the red must be observable from outside: an
    // in-process import would be a false pass under the guard-removed mutation,
    // where the child exits 0 having done its work before the importer's own
    // statement. The statement after the import running IS the assertion.
    const root = tempRoot();
    try {
      const importer = join(root, "importer.mjs");
      const url = pathToFileURL(fileURLToPath(import.meta.url)).href;
      writeFileSync(
        importer,
        'import { laneOf } from "' + url + '";' + NL +
        'console.log("IMPORT SURVIVED " + laneOf("ENVELOPE: F9 - a lane"));' + NL,
      );
      const r = spawnSync(process.execPath, [importer], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      const out = String(r.stdout || "") + String(r.stderr || "");
      return {
        text:
          "importing envelopeCheck.mjs, then one statement of the importer's own, printed: " +
          (out.trim().split(NL).join(" / ") || "(nothing, exit " + r.status + ")"),
        ok: /IMPORT SURVIVED F9/.test(out),
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  if (f.kind === "cli") {
    // The live run as a command, on roots this fixture builds: a clean one must
    // exit 0 and print the ok line, a corrected envelope with no clause must
    // exit 1 and print the failed line. --dir, never --self-test, which would
    // re-enter this suite.
    const good = tempRoot();
    const bad = tempRoot();
    try {
      build(good, { "F60.md": ORDINARY_HEAD + NL + "Holds" + NL + "  factory/tools/envelopeCheck.mjs" + NL });
      build(bad, { "F61.md": "ENVELOPE: F61 — CORRECTION 1 — no clause" + NL });
      const run = (root) =>
        spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--dir", root], {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });
      const a = run(good);
      const b = run(bad);
      const aText = String(a.stdout || "") + String(a.stderr || "");
      const bText = String(b.stdout || "") + String(b.stderr || "");
      const ok =
        a.status === 0 && /envelope check ok/.test(aText) &&
        b.status === 1 && /envelope check failed/.test(bText);
      return {
        text:
          "the live run exited " + a.status + " on a clean root and " + b.status + " on a bad one, " +
          "printing " + (aText.trim().split(NL).pop() || "(nothing)") + " / " +
          (bText.trim().split(NL).pop() || "(nothing)"),
        ok,
      };
    } finally {
      rmSync(good, { recursive: true, force: true });
      rmSync(bad, { recursive: true, force: true });
    }
  }
  const root = tempRoot();
  try {
    build(root, f.files);
    const res = checkDir(root);
    const text = render(res);
    const verdict = res.errors.length === 0 ? "pass" : "fail";
    const counted = f.errors == null || res.errors.length === f.errors;
    const refused = (f.refuse || []).find((w) => w.test(text));
    const ok = verdict === f.expect && counted && !refused && (f.wants || []).every((w) => w.test(text));
    const why = verdict !== f.expect
      ? "expected " + f.expect + ", got " + verdict
      : !counted
        ? res.errors.length + " error(s), expected " + f.errors
        : refused ? "printed text it must not print: " + refused : "";
    return { text, ok, verdict, why };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function selfTest() {
  const bad = [];
  for (const f of FIXTURES) {
    const r = runFixture(f);
    if (!r.ok) bad.push({ f, r });
    console.log(
      "  " + (r.ok ? "ok  " : "FAIL") + "  " + f.tag + "  (property " + f.prop + ")" +
      (r.why ? "  " + r.why : ""),
    );
    if (!r.ok) console.log(r.text.split(NL).map((l) => "        " + l).join(NL));
  }
  const props = new Set(FIXTURES.map((f) => f.prop)).size;
  if (bad.length) {
    console.error("envelopeCheck self-test failed: " + bad.length + " of " + FIXTURES.length + " clauses");
    process.exit(1);
  }
  console.log("envelopeCheck self-test ok — " + FIXTURES.length + " clauses, " + props + " properties");
}

// The CLI runs only when this file is the process entry point. An import must be
// free of side effects: without this test, importing ANY export ran the live
// check against the root named above and called process.exit, killing the
// importing script before its own code ran. The test is on the entry file name,
// which is the guard packet.mjs in this directory carries.
const isEntry = /envelopeCheck\.mjs$/.test(process.argv[1] || "");

if (isEntry) {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    selfTest();
    process.exit(0);
  }
  const at = argv.indexOf("--dir");
  const root = at >= 0 && argv[at + 1] ? resolve(argv[at + 1]) : kitRoot;
  const result = checkDir(root);
  const report = render(result);
  if (result.errors.length) console.error(report);
  else console.log(report);
  process.exit(result.errors.length ? 1 : 0);
}
