#!/usr/bin/env node
// Alumni contribute by measurement, not by paste.
//
//   node factory/tools/alumni.mjs scan <path>        signals in a product repo
//   node factory/tools/alumni.mjs intakes <path>     the same signals as intake rows
//   node factory/tools/alumni.mjs drop-status <id> <path>
//   node factory/tools/alumni.mjs checks             the check pack a new child copies
//   node factory/tools/alumni.mjs provenance         trap  <-  intake  <-  who paid
//   node factory/tools/alumni.mjs --self-test
//
// Read-only on the scanned tree. This file has no write path: everything
// leaves through stdout. Otto and Virbos stay alumni (T41); a drop that
// nobody adopted is a drop nobody measured (T62).
//
// Sizes come from stat, never from reading a file in. Scanning a repo
// must not cost what the repo costs to read.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "coverage", "build", ".next", "__pycache__"]);

// Portable probes. Each one names the trap that paid for it and the
// kit cap it measures against.
const PROBES = [
  { id: "A-AGENTS", match: (p) => p === "AGENTS.md", capKb: 12, trap: "T01" },
  { id: "A-BOARD", match: (p) => basename(p) === "BOARD.md", capKb: 40, trap: "T01" },
  { id: "A-TRAPS", match: (p) => /TRAPS\.(md|yaml|yml)$/i.test(p), capKb: 48, trap: "T01" },
  { id: "A-REGISTER", match: (p) => /DECISION_REGISTER\.md$/i.test(p), capKb: 80, trap: "T01" },
  { id: "A-LANELOG", match: (p) => /^docs\/log\/[^/]+\.md$/i.test(p), capKb: 8, trap: "T01" },
  { id: "A-RULES", match: (p) => /BUSINESS_RULES\.md$/i.test(p), capKb: 400, trap: "T01" },
];

const BANNED = [
  { id: "A-SESSIONLOG", match: (p) => /SESSION_LOG\.md$/i.test(p), trap: "T26" },
  { id: "A-HANDOFF", match: (p) => /(^|\/)(handoff|CONTROL_PLANE_HANDOFF)\.md$/i.test(p), trap: "T26" },
  { id: "A-COMPACTION", match: (p) => /(^|\/)compaction\.md$/i.test(p), trap: "T26" },
  { id: "A-WAIVER", match: (p) => /(^|\/)\.waiver$/.test(p), trap: "T40" },
];

function walk(dir, root, acc) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs, root, acc);
    else acc.push({ path: abs.slice(root.length + 1).split("\\").join("/"), size: st.size });
  }
  return acc;
}

function tracked(root) {
  const r = spawnSync("git", ["-C", root, "ls-files"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) return walk(root, root, []);
  const rows = [];
  for (const rel of (r.stdout || "").split(NL).filter(Boolean)) {
    try {
      rows.push({ path: rel, size: statSync(join(root, rel)).size });
    } catch {
      /* a tracked file not in the working tree is not a signal */
    }
  }
  return rows;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1);
}

export function scan(root) {
  const files = tracked(root);
  const signals = [];

  for (const probe of PROBES) {
    for (const f of files) {
      if (!probe.match(f.path)) continue;
      if (f.size > probe.capKb * 1024) {
        signals.push({
          id: probe.id,
          trap: probe.trap,
          path: f.path,
          measure: kb(f.size) + " KB over a " + probe.capKb + " KB cap",
          kind: "over-cap",
        });
      }
    }
  }

  for (const ban of BANNED) {
    for (const f of files) {
      if (!ban.match(f.path)) continue;
      signals.push({
        id: ban.id,
        trap: ban.trap,
        path: f.path,
        measure: kb(f.size) + " KB present and tracked",
        kind: "banned-file",
      });
    }
  }

  // The reading path: what every seat in that repo pays before it works.
  const readingPath = files.filter(
    (f) =>
      f.path === "AGENTS.md" ||
      basename(f.path) === "BOARD.md" ||
      /TRAPS\.(md|yaml|yml)$/i.test(f.path),
  );
  const readBytes = readingPath.reduce((n, f) => n + f.size, 0);
  signals.push({
    id: "A-READPATH",
    trap: "T61",
    path: readingPath.map((f) => f.path).join(" + ") || "(none)",
    measure: kb(readBytes) + " KB read by every seat before any work",
    kind: readBytes > 32 * 1024 ? "over-cap" : "note",
  });

  // A generated board cannot drift. A hand-edited one already has.
  const hasSource = files.some((f) => /board\.json$/.test(f.path));
  const hasBoard = files.some((f) => basename(f.path) === "BOARD.md");
  if (hasBoard && !hasSource) {
    signals.push({
      id: "A-HANDBOARD",
      trap: "T01",
      path: "BOARD.md",
      measure: "no board.json in the tree; the markdown is the source",
      kind: "hand-edited",
    });
  }

  return { files: files.length, signals };
}

function childRow(id) {
  const lineage = JSON.parse(readFileSync(join(kitRoot, "factory/lineage.json"), "utf8"));
  return (lineage.children || []).find((c) => c.id === id);
}

export function dropStatus(child, root) {
  const drop = child && child.drop;
  if (!drop || typeof drop !== "object" || !drop.expect) {
    return { ok: false, lines: ["no drop expectation recorded for " + (child ? child.id : "?")] };
  }
  const lines = [];
  const script = drop.expect.script;
  const gate = drop.expect.gate;
  const scriptHere = existsSync(join(root, script));
  let wired = false;
  if (gate && existsSync(join(root, gate))) {
    try {
      wired = readFileSync(join(root, gate), "utf8").includes(basename(script));
    } catch {
      wired = false;
    }
  }
  lines.push("drop      " + drop.file + "  issued " + drop.at);
  lines.push("script    " + script + "  " + (scriptHere ? "present" : "ABSENT"));
  lines.push("gate      " + gate + "  " + (wired ? "names the script" : "DOES NOT name the script"));
  lines.push("verdict   " + (scriptHere && wired ? "adopted" : "not adopted"));
  return { ok: scriptHere && wired, lines };
}

function intakeRows(child, report, at) {
  const rows = [];
  let n = 1;
  for (const s of report.signals) {
    if (s.kind === "note") continue;
    const id = "C-" + child.toUpperCase() + "-" + String(n).padStart(2, "0");
    n += 1;
    rows.push({
      id,
      child,
      at,
      kind: "trap",
      title: s.id + " " + s.path.split(" + ")[0],
      charged: "Measured in the child: " + s.measure + ".",
      rule:
        s.kind === "banned-file"
          ? "Do not keep " + basename(s.path) + " as live memory. Git is memory."
          : "Keep " + basename(s.path) + " under its cap. Archive at 80% between landings.",
      check: "node factory/tools/alumni.mjs scan <path> reports no " + s.id + " signal.",
      portable: "portable",
      absorbedAs: s.trap,
    });
  }
  return rows;
}

function checkPack() {
  const landing = JSON.parse(readFileSync(join(kitRoot, "factory/landing-checks.json"), "utf8"));
  const lineage = JSON.parse(readFileSync(join(kitRoot, "factory/lineage.json"), "utf8"));
  const paidBy = new Map();
  for (const row of lineage.intakes || []) {
    const key = String(row.absorbedAs || "");
    if (!key) continue;
    if (!paidBy.has(key)) paidBy.set(key, []);
    paidBy.get(key).push(row.child + " " + row.id);
  }
  const out = [];
  out.push("# Check pack — copy these into the new child's gate");
  out.push("");
  out.push("Each line is a step factory/landing-checks.json already runs.");
  out.push("");
  for (const step of landing.steps || []) {
    out.push("- " + step.name);
    out.push("    " + step.run);
  }
  out.push("");
  out.push("# Who paid for the law behind them");
  out.push("");
  for (const [law, payers] of [...paidBy.entries()].sort()) {
    out.push("- " + law + "  <-  " + payers.join(", "));
  }
  return out.join(NL);
}

function provenance() {
  const lineage = JSON.parse(readFileSync(join(kitRoot, "factory/lineage.json"), "utf8"));
  const traps = readFileSync(join(kitRoot, "factory/traps.yaml"), "utf8");
  const out = ["law       intake  child     title"];
  for (const row of lineage.intakes || []) {
    const law = String(row.absorbedAs || "(none)");
    const known = law.startsWith("T") ? new RegExp("^- id: " + law + "$", "m").test(traps) : true;
    out.push(
      law.padEnd(10) +
        row.id.padEnd(8) +
        String(row.child).padEnd(10) +
        row.title +
        (known ? "" : "   <- names no trap"),
    );
  }
  return out.join(NL);
}

function printScan(root, report) {
  console.log("scanned   " + root);
  console.log("files     " + report.files);
  console.log("");
  console.log("signal        trap   kind          where / measure");
  for (const s of report.signals) {
    console.log(
      s.id.padEnd(14) + s.trap.padEnd(7) + s.kind.padEnd(14) + s.path + "  —  " + s.measure,
    );
  }
  const hard = report.signals.filter((s) => s.kind !== "note");
  console.log("");
  console.log(hard.length ? hard.length + " signals worth an intake" : "no signals");
}

function fixture(tree) {
  const { mkdtempSync, mkdirSync, writeFileSync } = fsMod;
  const dir = mkdtempSync(join(tmpdirMod.tmpdir(), "alumni-"));
  for (const rel of Object.keys(tree)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, tree[rel]);
  }
  return dir;
}

import * as fsMod from "node:fs";
import * as tmpdirMod from "node:os";

function selfTest() {
  const errors = [];
  const fat = fixture({
    "AGENTS.md": "x".repeat(20 * 1024),
    "BOARD.md": "x".repeat(300 * 1024),
    "SESSION_LOG.md": "x".repeat(1024),
    "docs/log/o5.md": "x".repeat(500 * 1024),
    "src/app.js": "ok",
  });
  const lean = fixture({
    "AGENTS.md": "small",
    "BOARD.md": "small",
    "factory/board.json": "{}",
    "src/app.js": "ok",
  });
  try {
    const before = fsMod.readdirSync(fat).sort().join(",");
    const report = scan(fat);
    const after = fsMod.readdirSync(fat).sort().join(",");
    if (before !== after) errors.push("scan wrote into the scanned tree");

    for (const want of ["A-AGENTS", "A-BOARD", "A-SESSIONLOG", "A-LANELOG", "A-HANDBOARD"]) {
      if (!report.signals.some((s) => s.id === want)) errors.push("fat repo missed " + want);
    }
    const clean = scan(lean);
    if (clean.signals.some((s) => s.kind !== "note")) {
      errors.push("lean repo produced a signal: " + JSON.stringify(clean.signals));
    }

    // Emitted rows must pass the gate the parent already runs.
    const rows = intakeRows("otto", report, "2026-09-20");
    if (!rows.length) errors.push("no intake rows from a fat repo");
    const tmpFile = join(fat, "..", "intake-candidate.json");
    fsMod.writeFileSync(tmpFile, JSON.stringify({ ...rows[0], absorbedAs: undefined }, null, 2));
    const r = spawnSync(process.execPath, [join(kitRoot, "factory/tools/intake.mjs"), tmpFile], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      errors.push("emitted intake fails the intake gate: " + (r.stderr || r.stdout || "").trim());
    }
    fsMod.rmSync(tmpFile, { force: true });

    const status = dropStatus(
      { id: "x", drop: { file: "f", at: "2026-09-17", expect: { script: "tools/sizeBudget.js", gate: "tools/check.yml" } } },
      lean,
    );
    if (status.ok) errors.push("a repo without the script was called adopted");

    const adopted = fixture({
      "tools/sizeBudget.js": "cap",
      "tools/check.yml": "  - name: size budgets" + NL + "    run: node tools/sizeBudget.js" + NL,
    });
    const good = dropStatus(
      { id: "x", drop: { file: "f", at: "2026-09-17", expect: { script: "tools/sizeBudget.js", gate: "tools/check.yml" } } },
      adopted,
    );
    if (!good.ok) errors.push("an adopted drop was called not adopted");
    fsMod.rmSync(adopted, { recursive: true, force: true });

    if (!checkPack().includes("node factory/tools/")) errors.push("check pack names no command");
    if (provenance().includes("names no trap")) errors.push("an intake names a trap that does not exist");
  } finally {
    fsMod.rmSync(fat, { recursive: true, force: true });
    fsMod.rmSync(lean, { recursive: true, force: true });
  }

  if (errors.length) {
    console.error("alumni self-test failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("alumni self-test ok");
  process.exit(0);
}

const cmd = process.argv[2] || "checks";

if (cmd === "--self-test") selfTest();

if (cmd === "checks") {
  console.log(checkPack());
  process.exit(0);
}

if (cmd === "provenance") {
  console.log(provenance());
  process.exit(0);
}

if (cmd === "scan" || cmd === "intakes") {
  const root = process.argv[3];
  if (!root || !existsSync(root)) {
    console.error("usage: node factory/tools/alumni.mjs " + cmd + " <path to a working copy>");
    process.exit(1);
  }
  const report = scan(root);
  if (cmd === "scan") {
    printScan(root, report);
    process.exit(0);
  }
  const child = process.argv[4] || basename(root).toLowerCase();
  const at = new Date().toISOString().slice(0, 10);
  console.log(JSON.stringify(intakeRows(child, report, at), null, 2));
  process.exit(0);
}

if (cmd === "drop-status") {
  const id = process.argv[3];
  const root = process.argv[4];
  const child = childRow(id);
  if (!child) {
    console.error("unknown child: " + id);
    process.exit(1);
  }
  if (!root || !existsSync(root)) {
    console.error("usage: node factory/tools/alumni.mjs drop-status " + id + " <path to that product>");
    process.exit(1);
  }
  const status = dropStatus(child, root);
  console.log("child     " + child.id + "  " + child.repo);
  for (const l of status.lines) console.log(l);
  process.exit(status.ok ? 0 : 2);
}

console.error("usage: node factory/tools/alumni.mjs scan|intakes|drop-status|checks|provenance|--self-test");
process.exit(1);
