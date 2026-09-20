#!/usr/bin/env node
// Validate an intake against the contract, the refuse list, and duplicates.
// Absorbing is still a Grok envelope. This tool does not write the kit.
//
//   node factory/tools/intake.mjs path/to/intake.json
//   node factory/tools/intake.mjs --check-register
//   node factory/tools/intake.mjs --template
//   node factory/tools/intake.mjs --self-test

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BANNED = /please merge|copy the child|child'?s board|payroll|employee rank|real people|\bpii\b/i;
const KINDS = new Set(["trap", "lesson", "practice"]);
const PORTABLE = new Set(["portable", "machine", "reject"]);
const STATUS = new Set(["absorbed", "pending", "shelved", "rejected"]);
const ID_RE = /^[A-Za-z0-9._-]+$/;
const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const TEMPLATE = `INTAKE: <ID> — <TITLE>
Child: <repo>
Kind: trap | lesson | practice
Portable: portable | machine | reject

Charged
  <one sentence: what it cost, in time or money or a landed defect>

Rule
  <one sentence the next seat can follow>

Check
  <the command, gate step, or envelope hold that would catch a repeat>

Refuse if this is a child's BOARD, a SESSION_LOG, a copied count, or real data.
Absorbing this is a Grok envelope. The child does not write VirBk/virbk.
`;

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadRegister() {
  const path = join(root, "factory/lineage.json");
  if (!existsSync(path)) throw new Error("factory/lineage.json missing");
  return loadJson(path);
}

function fail(label, errors) {
  console.error(label);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

function shapeErrors(row, { requireStatus = false } = {}) {
  const errors = [];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return ["not an object"];
  }
  const extra = Object.keys(row).filter(
    (k) =>
      ![
        "id",
        "child",
        "at",
        "kind",
        "title",
        "charged",
        "rule",
        "check",
        "portable",
        "status",
        "absorbedAs",
      ].includes(k),
  );
  if (extra.length) errors.push("unknown fields: " + extra.join(", "));
  if (typeof row.id !== "string" || !ID_RE.test(row.id)) errors.push("id");
  if (typeof row.child !== "string" || row.child.trim().length < 1) errors.push("child");
  if (typeof row.at !== "string" || !DATE_RE.test(row.at)) errors.push("at (YYYY-MM-DD)");
  if (!KINDS.has(row.kind)) errors.push("kind");
  if (typeof row.title !== "string" || row.title.trim().length < 4) errors.push("title");
  if (typeof row.charged !== "string" || row.charged.trim().length < 12) errors.push("charged");
  if (typeof row.rule !== "string" || row.rule.trim().length < 12) errors.push("rule");
  if (typeof row.check !== "string" || row.check.trim().length < 12) {
    errors.push("check — a rule with no check is a diary");
  }
  if (!PORTABLE.has(row.portable)) errors.push("portable");
  if (requireStatus && !STATUS.has(row.status)) errors.push("status");
  if (row.status != null && !STATUS.has(row.status)) errors.push("status");
  return errors;
}

// An absorbed portable row names the law it became, and that law is in
// the tree: a trap id, or a file and a numbered section.
function lawErrors(row, root) {
  if (row.status !== "absorbed" || row.portable !== "portable") return [];
  const named = String(row.absorbedAs || "").trim();
  if (!named) return ["absorbedAs — an absorbed lesson names the law it became"];
  const NL = String.fromCharCode(10);
  if (/^T[0-9]+$/.test(named)) {
    const traps = readFileSync(join(root, "factory/traps.yaml"), "utf8");
    const has = traps.split(NL).some((line) => line.trim() === "- id: " + named);
    return has ? [] : ["absorbedAs names " + named + ", which is not in traps.yaml"];
  }
  const parts = named.split(" ");
  const section = parts.length === 2 ? parts[1] : "";
  if (!/^[0-9]+$/.test(section)) {
    return ["absorbedAs must be a trap id or a file and section: " + named];
  }
  const file = join(root, parts[0]);
  if (!existsSync(file)) return ["absorbedAs names " + parts[0] + ", which is not in the tree"];
  const text = readFileSync(file, "utf8");
  return text.includes("## " + section + ".")
    ? []
    : ["absorbedAs names " + named + ", and that section is not in " + parts[0]];
}

function gateErrors(row, existing) {
  const errors = [];
  const title = String(row.title || "").trim();
  const rule = String(row.rule || "").trim();
  const check = String(row.check || "").trim();
  const blob = `${title} ${row.charged || ""} ${rule}`;
  if (rule.length < 12) errors.push("G-rule");
  if (check.length < 12) errors.push("G-check");
  if (row.portable !== "portable" && row.portable !== "machine") errors.push("G-portable");
  if (rule.length + check.length >= 800) errors.push("G-size");
  const dup = (existing || []).some(
    (e) =>
      e.id !== row.id &&
      (e.title.trim().toLowerCase() === title.toLowerCase() ||
        (rule.length > 0 && e.rule.trim().toLowerCase() === rule.toLowerCase())),
  );
  if (!title || dup) errors.push("G-dup");
  if (BANNED.test(blob)) errors.push("G-refuse");
  return errors;
}

function validateOne(row, existing, opts) {
  const shape = shapeErrors(row, opts);
  if (shape.length) return shape;
  return gateErrors(row, existing);
}

const cmd = process.argv[2];

if (cmd === "--template") {
  process.stdout.write(TEMPLATE);
  process.exit(0);
}

if (cmd === "--check-register") {
  const register = loadRegister();
  const intakes = Array.isArray(register.intakes) ? register.intakes : [];
  const errors = [];
  const seen = new Set();
  for (const row of intakes) {
    if (seen.has(row.id)) errors.push(row.id + " duplicate id");
    seen.add(row.id);
    const rest = intakes.filter((x) => x.id !== row.id);
    const rowErrors = validateOne(row, rest, { requireStatus: true });
    for (const e of rowErrors) errors.push(row.id + " " + e);
    for (const e of lawErrors(row, root)) errors.push(row.id + " " + e);
    if (row.status === "absorbed" && row.portable === "reject") {
      errors.push(row.id + " absorbed but portable=reject");
    }
  }
  if (errors.length) fail("register failed", errors);
  console.log("register ok  " + intakes.length + " intakes");
  process.exit(0);
}

if (cmd === "--self-test") {
  const register = loadRegister();
  const existing = register.intakes;
  const cases = [
    {
      name: "valid pending",
      row: {
        id: "P99",
        child: "next",
        at: "2026-09-16",
        kind: "trap",
        title: "Writer lands its own branch",
        charged: "The review was theatre. Main moved under a self-land.",
        rule: "A writer never fast-forwards main and never reviews its own branch.",
        check: "Landing gate refuses a return whose author equals the reviewer.",
        portable: "portable",
      },
      pass: true,
    },
    {
      name: "missing check",
      row: {
        id: "P98",
        child: "next",
        at: "2026-09-16",
        kind: "lesson",
        title: "Something felt slow",
        charged: "A seat spent a sitting and wrote no measuring command.",
        rule: "Always measure before claiming a win in the lane log.",
        check: "",
        portable: "portable",
      },
      pass: false,
    },
    {
      name: "child board",
      row: {
        id: "P97",
        child: "next",
        at: "2026-09-16",
        kind: "lesson",
        title: "Please merge our BOARD.md",
        charged: "The child wants its ledger in the parent.",
        rule: "Copy the child's board into the parent so history is one place.",
        check: "diff the two BOARD.md files and keep both sections.",
        portable: "portable",
      },
      pass: false,
    },
    {
      name: "duplicate of I01",
      row: {
        id: "P96",
        child: "next",
        at: "2026-09-16",
        kind: "practice",
        title: "Envelope as the only authorization",
        charged: "Another child learned the same thing the hard way.",
        rule: "No envelope, no code. One page: acceptance, base SHA, holds, check.",
        check: "Landing refuses a branch whose return does not cite an envelope id.",
        portable: "portable",
      },
      pass: false,
    },
  ];
  const failed = [];
  for (const c of cases) {
    const errors = validateOne(c.row, existing, {});
    const ok = errors.length === 0;
    if (ok !== c.pass) failed.push(c.name + " expected " + c.pass + " got " + ok + " " + errors.join(","));
  }
  const registerErrors = [];
  for (const row of existing) {
    const rest = existing.filter((x) => x.id !== row.id);
    registerErrors.push(...validateOne(row, rest, { requireStatus: true }).map((e) => row.id + " " + e));
  }
  if (registerErrors.length) failed.push("register: " + registerErrors.join("; "));
  if (failed.length) fail("self-test failed", failed);
  console.log("self-test ok");
  process.exit(0);
}

if (!cmd || cmd.startsWith("-")) {
  console.error("usage: node factory/tools/intake.mjs <file.json> | --check-register | --template | --self-test");
  process.exit(1);
}

const file = cmd;
if (!existsSync(file)) fail("intake failed", [file + " not found"]);
let row;
try {
  row = loadJson(file);
} catch (err) {
  fail("intake failed", [String(err.message || err)]);
}
const existing = loadRegister().intakes.filter((x) => x.status !== "rejected");
const errors = validateOne(row, existing, {});
if (errors.length) fail("intake failed", errors);
console.log("intake ok  " + row.id);
