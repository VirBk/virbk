#!/usr/bin/env node
// A rule you cannot break on purpose is not a placeholder, it is a wall.
//
//   node factory/tools/experiment.mjs open --claim "..." --suspends "<step name>"
//        --hypothesis "..." --measure "<command>" --days 7
//   node factory/tools/experiment.mjs list
//   node factory/tools/experiment.mjs close X01 --kept --result "..."
//   node factory/tools/experiment.mjs close X01 --reverted --result "..."
//   node factory/tools/experiment.mjs check
//   node factory/tools/experiment.mjs --self-test
//
// An open experiment names a landing step it suspends. The gate still
// RUNS that step and still prints what it found; it just does not fail
// the landing on it. A deliberate break is visible and measured instead
// of hidden behind an untracked waiver.
//
// Two things keep this from becoming a permanent exception:
//   - every experiment has an expiry, and an expired open one fails the
//     gate through this file's check;
//   - a step that passes while suspended is reported as such, which is
//     the signal that the experiment is finished.
//
// Suspending is not permission. Money, credentials, real people's data
// and destructive acts are the owner's, and no row here touches them.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const STORE = "factory/experiments.json";
const STATUSES = new Set(["open", "kept", "reverted"]);
const ID_RE = /^X\d{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 30;

const RULE =
  "An experiment suspends a named landing step for a stated hypothesis and " +
  "a stated number of days. The gate still runs the step and still prints " +
  "the result; it does not fail the landing on it. An expired open " +
  "experiment fails the gate. Owner boundaries are not suspendable here.";

function fail(label, errors) {
  console.error(label);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

export function load(root) {
  const p = join(root, STORE);
  if (!existsSync(p)) return { rule: RULE, experiments: [] };
  const data = JSON.parse(readFileSync(p, "utf8"));
  if (!Array.isArray(data.experiments)) throw new Error(STORE + " has no experiments array");
  return data;
}

function save(root, data) {
  mkdirSync(join(root, "factory"), { recursive: true });
  writeFileSync(join(root, STORE), JSON.stringify(data, null, 2) + NL);
}

function stepNames(root) {
  const p = join(root, "factory/landing-checks.json");
  if (!existsSync(p)) return [];
  const m = JSON.parse(readFileSync(p, "utf8"));
  return (m.steps || []).map((s) => String(s.name));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nextId(items) {
  let max = 0;
  for (const it of items) {
    const m = /^X(\d+)$/.exec(it.id || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return "X" + String(max + 1).padStart(2, "0");
}

export function itemErrors(root, it) {
  const errors = [];
  if (!it || typeof it !== "object" || Array.isArray(it)) return ["not an object"];
  const id = it.id || "?";
  if (!ID_RE.test(it.id || "")) errors.push("id");
  if (typeof it.claim !== "string" || it.claim.trim().length < 12) errors.push(id + " claim");
  if (typeof it.hypothesis !== "string" || it.hypothesis.trim().length < 12) {
    errors.push(id + " hypothesis — say what you expect to see if the rule is wrong");
  }
  const measure = String(it.measure || "").trim();
  if (measure.length < 8 || !/\s/.test(measure)) {
    errors.push(id + " measure must be the command that decides it");
  }
  if (!Array.isArray(it.suspends) || !it.suspends.length) errors.push(id + " suspends is empty");
  // A typo here would suspend nothing and read as though it had.
  const known = stepNames(root);
  if (known.length) {
    for (const name of it.suspends || []) {
      if (!known.includes(name)) errors.push(id + " suspends a step no manifest has: " + name);
    }
  }
  if (!DATE_RE.test(it.opened || "")) errors.push(id + " opened");
  if (!DATE_RE.test(it.expires || "")) errors.push(id + " expires");
  if (DATE_RE.test(it.opened || "") && DATE_RE.test(it.expires || "")) {
    if (it.expires <= it.opened) errors.push(id + " expires before it opens");
    if (addDays(it.opened, MAX_DAYS) < it.expires) {
      errors.push(id + " runs longer than " + MAX_DAYS + " days");
    }
  }
  if (!STATUSES.has(it.status)) errors.push(id + " status");
  if (it.status !== "open" && !String(it.result || "").trim()) {
    errors.push(id + " closed without a result — paste what the measure printed");
  }
  return errors;
}

// The gate asks this. Open and unexpired suspends; anything else does not.
export function suspendedBy(root, stepName, now) {
  const at = now || today();
  for (const it of load(root).experiments) {
    if (it.status !== "open") continue;
    if (it.expires < at) continue;
    if ((it.suspends || []).includes(stepName)) return it;
  }
  return null;
}

export function check(root) {
  const errors = [];
  let data;
  try {
    data = load(root);
  } catch (err) {
    return [STORE + ": " + String(err.message || err)];
  }
  if (typeof data.rule !== "string" || !/expired open experiment fails the gate/i.test(data.rule)) {
    errors.push(STORE + " rule must say an expired open experiment fails the gate");
  }
  const ids = new Set();
  const at = today();
  for (const it of data.experiments) {
    errors.push(...itemErrors(root, it));
    if (it.id) {
      if (ids.has(it.id)) errors.push("dup " + it.id);
      ids.add(it.id);
    }
    if (it.status === "open" && DATE_RE.test(it.expires || "") && it.expires < at) {
      errors.push(it.id + " expired on " + it.expires + " — close it kept or reverted");
    }
  }
  return errors;
}

function flags(argv) {
  const out = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const n = argv[i + 1];
      if (n && !n.startsWith("--")) {
        out[k] = n;
        i++;
      } else out[k] = true;
    } else rest.push(a);
  }
  return { out, rest };
}

function cmdOpen(root, f) {
  const data = load(root);
  const opened = today();
  const days = Number(f.days || 7);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    fail("open refused", ["days must be 1 to " + MAX_DAYS]);
  }
  const item = {
    id: nextId(data.experiments),
    claim: String(f.claim || "").trim(),
    suspends: String(f.suspends || "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean),
    hypothesis: String(f.hypothesis || "").trim(),
    measure: String(f.measure || "").trim(),
    opened,
    expires: addDays(opened, days),
    status: "open",
  };
  const errors = itemErrors(root, item);
  if (errors.length) fail("open refused", errors);
  data.experiments.push(item);
  save(root, data);
  console.log(item.id + " open until " + item.expires + " — suspends " + item.suspends.join(", "));
}

function cmdClose(root, id, f) {
  const data = load(root);
  const item = data.experiments.find((it) => it.id === id);
  if (!item) fail("close refused", [id + " not found"]);
  if (item.status !== "open") fail("close refused", [id + " is " + item.status]);
  if (!f.kept && !f.reverted) fail("close refused", ["say --kept or --reverted"]);
  item.status = f.kept ? "kept" : "reverted";
  item.result = String(f.result || "").trim();
  item.closed = today();
  const errors = itemErrors(root, item);
  if (errors.length) fail("close refused", errors);
  save(root, data);
  console.log(id + " " + item.status);
}

function cmdList(root) {
  const data = load(root);
  const at = today();
  if (!data.experiments.length) {
    console.log("no experiments — the rules are the rules today");
    return;
  }
  for (const it of data.experiments) {
    const late = it.status === "open" && it.expires < at ? "  EXPIRED" : "";
    console.log(it.id + " " + it.status + late);
    console.log("  claim       " + it.claim);
    console.log("  suspends    " + (it.suspends || []).join(", "));
    console.log("  hypothesis  " + it.hypothesis);
    console.log("  measure     " + it.measure);
    console.log("  window      " + it.opened + " to " + it.expires);
    if (it.result) console.log("  result      " + it.result);
  }
}

function selfTest() {
  const errors = check(kitRoot).map((e) => "live: " + e);

  const dir = mkdtempSync(join(tmpdir(), "grok-exp-"));
  try {
    mkdirSync(join(dir, "factory"), { recursive: true });
    writeFileSync(
      join(dir, "factory/landing-checks.json"),
      JSON.stringify({ steps: [{ name: "Real step", run: "true" }] }, null, 2) + NL,
    );
    cmdOpen(dir, {
      claim: "This step encodes a guess, not a fact.",
      suspends: "Real step",
      hypothesis: "Landing without it costs nothing measurable.",
      measure: "node factory/tools/landingGate.mjs --sha HEAD",
      days: 7,
    });
    const one = load(dir).experiments[0];
    if (one.id !== "X01") errors.push("open did not mint X01");
    if (!suspendedBy(dir, "Real step")) errors.push("an open experiment did not suspend its step");
    if (suspendedBy(dir, "Other step")) errors.push("a step nobody named was suspended");

    // Expiry is the whole safety property: it must stop suspending.
    const data = load(dir);
    data.experiments[0].expires = "2000-01-01";
    save(dir, data);
    if (suspendedBy(dir, "Real step")) errors.push("an expired experiment still suspended");
    if (!check(dir).some((e) => /expired/.test(e))) {
      errors.push("an expired open experiment did not fail check");
    }

    data.experiments[0].expires = addDays(today(), 3);
    save(dir, data);
    cmdClose(dir, "X01", { kept: true, result: "Landed 12 times with it off; nothing regressed." });
    if (suspendedBy(dir, "Real step")) errors.push("a closed experiment still suspended");
    const after = check(dir);
    if (after.length) errors.push("a closed experiment failed check: " + after.join(", "));

    // A typo must not read as a suspension.
    const typo = {
      id: "X02",
      claim: "A step name with a typo in it.",
      suspends: ["Reel step"],
      hypothesis: "This should never be accepted at all.",
      measure: "node factory/tools/experiment.mjs check",
      opened: today(),
      expires: addDays(today(), 3),
      status: "open",
    };
    if (!itemErrors(dir, typo).some((e) => /no manifest has/.test(e))) {
      errors.push("a step name that does not exist was accepted");
    }
    const noResult = { ...typo, id: "X03", suspends: ["Real step"], status: "kept" };
    if (!itemErrors(dir, noResult).some((e) => /without a result/.test(e))) {
      errors.push("an experiment closed with no result was accepted");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (errors.length) fail("experiment self-test failed", errors);
  console.log("experiment self-test ok");
}

// Importable: the landing gate asks suspendedBy(). Only run the CLI when
// this file is what node was pointed at.
const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

const ROOT = process.env.EXPERIMENT_ROOT || kitRoot;
const argv = process.argv.slice(2);
const cmd = argv[0];
const { out, rest } = flags(argv.slice(1));

if (!isMain) {
  // imported
} else if (cmd === "--self-test") selfTest();
else if (cmd === "check") {
  const errors = check(ROOT);
  if (errors.length) fail("experiment check failed", errors);
  const open = load(ROOT).experiments.filter((e) => e.status === "open").length;
  console.log("experiment check ok" + (open ? "  " + open + " open" : ""));
} else if (cmd === "open") cmdOpen(ROOT, out);
else if (cmd === "close") cmdClose(ROOT, rest[0], out);
else if (cmd === "list") cmdList(ROOT);
else {
  console.error("usage: node factory/tools/experiment.mjs open|close|list|check|--self-test");
  process.exit(1);
}
