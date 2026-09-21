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
// A TRAPS file the scan finds is opened and read row by row: the file is
// capped by A-TRAPS at 48 KB, and opening it is the point of the tool
// (T71 — structure alone never carried a child's lesson to the parent).
// Every other size comes from stat, never from reading a file in.
//
// A row that names a check becomes a candidate intake. A row that names
// none is counted and printed by id and emitted as nothing, because the
// gate refuses a checkless intake and a refused intake is noise the owner
// learns to skip (T24). Nothing leaves here that intake.mjs would refuse:
// the floors are the contract's, read from contracts/intake.v1.json rather
// than carried as a copy.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "coverage", "build", ".next", "__pycache__"]);

// The CLI runs only when this file is the process entry point. The readers
// below are exported for the lane that imports them, and a dispatch that ran
// on import printed the whole check pack and exited the importer — a gate
// step that cannot fail (T14). The test is on the entry name, so a
// mis-detection in the safe direction is impossible: node sets argv[1] to the
// file it was told to run. packet.mjs closes the same hazard the same way.
const isEntry = /alumni\.mjs$/.test(process.argv[1] || "");

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

// ---------------------------------------------------------------- TRAPS rows
//
// The probe above matches a TRAPS path and reports its size. Nothing opened
// the file, so a lesson a child wrote in prose reached the parent only when
// a person read it (T71). These functions open it.
//
// Row shapes accepted, and nothing else:
//   yaml   a "- id: T71" list item, keys title/rule/charged/cost/check/kind
//          on indented lines, wrapped values joined with a space
//   md     a col-0 bullet "- T71 text", or an ATX heading "## T71 text"
// A row id is a letter-led token carrying digits (T71, O12, OTTO-3). A
// bullet that does not start with one is prose and is not a row.
const TRAPS_FILE = /TRAPS\.(md|yaml|yml)$/i;
const ROW_ID = /^([A-Za-z][A-Za-z0-9]{0,5}[-_]?[0-9]{1,4})(?:[\s:.)\u2014-]|$)/;

// A row names a check or it does not, and one function decides, so the two
// cases cannot blur. The directive is capital-C "Check is" or "Check:", and
// only a capital-C one counts: ordinary prose ("check is ticked") is not the
// directive, and matching it is how a row carrying a junk check reached the
// gate, which is worse than a row held because the owner acts on it. A row
// may carry more than one candidate and the LAST wins, because the directive
// ends a row by convention and prose precedes it; taking the first let prose
// win and could push the rule under its floor, holding as checkless a row
// that carried a good check. An em dash before "Check:" is not a boundary.
// An unrecognised spelling reads as "names no check", which is the safe way
// to be wrong. The check runs to the end of its line, so trailing prose on a
// later line stays in the rule.
function splitCheck(body) {
  const text = String(body || "").replace(/\r\n/g, NL);
  const re = /(^|[.;][ \t]+|\n[ \t]*)Check(?:[ \t]+is|:)[ \t]+([^\n]+)/g;
  let last = null;
  for (const m of text.matchAll(re)) last = m;
  if (!last) return { rule: text, check: "" };
  const cut = last.index + last[1].length;
  return {
    rule: text.slice(0, cut).trim().replace(/[.;]$/, ""),
    check: last[2].trim().replace(/[.;]$/, ""),
  };
}

let floorsCache = null;
// The floors are the contract's own numbers, read from the contract, so the
// rule that decides what leaves here is the rule the gate enforces (T02).
function floors() {
  if (floorsCache) return floorsCache;
  const contract = JSON.parse(readFileSync(join(kitRoot, "contracts/intake.v1.json"), "utf8"));
  const out = {};
  for (const name of ["title", "charged", "rule", "check"]) {
    const min = contract.properties && contract.properties[name] && contract.properties[name].minLength;
    if (!Number.isInteger(min)) {
      throw new Error("contracts/intake.v1.json declares no minLength for " + name);
    }
    out[name] = min;
  }
  floorsCache = out;
  return out;
}

function collapse(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// A YAML scalar may be quoted, and YAML strips the pair before the value
// reaches anyone. A reader that keeps the quotes carries them into the id, the
// kind, the title, the rule and the check: the minted id names a row that does
// not exist, a quoted `machine` reads as portable, and the owner is handed the
// quotes as the value. One matching pair only, and only at the two ends: an
// apostrophe inside a rule is not a quote character and has to survive.
function unquote(text) {
  const s = String(text == null ? "" : text);
  if (s.length < 2) return s;
  const q = s[0];
  return (q === '"' || q === "'") && s[s.length - 1] === q ? s.slice(1, -1) : s;
}

export function parseTrapsYaml(text) {
  const rows = [];
  const noid = [];
  let cur = null;
  let key = null;
  text.replace(/\r\n/g, NL).split(NL).forEach((raw, i) => {
    if (!raw.trim() || /^\s*#/.test(raw)) return;
    const item = /^-\s*(.*)$/.exec(raw);
    if (item) {
      cur = { line: i + 1, keys: {} };
      rows.push(cur);
      key = null;
      const m = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]?(.*)$/.exec(item[1]);
      if (m) {
        cur.keys[m[1]] = m[2];
        key = m[1];
      }
      return;
    }
    const kv = /^\s+([A-Za-z][A-Za-z0-9_-]*):[ \t]?(.*)$/.exec(raw);
    if (kv && cur) {
      cur.keys[kv[1]] = kv[2];
      key = kv[1];
      return;
    }
    if (cur && key) cur.keys[key] += " " + raw.trim();
  });
  const out = [];
  for (const r of rows) {
    const id = unquote(String(r.keys.id || "").trim());
    if (!id) {
      noid.push(r.line);
      continue;
    }
    out.push({
      line: r.line,
      id,
      title: unquote(collapse(r.keys.title)),
      body: unquote(collapse(r.keys.rule || r.keys.charged || r.keys.cost)),
      check: unquote(collapse(r.keys.check)),
      kind: unquote(collapse(r.keys.kind)),
    });
  }
  return { rows: out, noid };
}

export function parseTrapsMarkdown(text) {
  const lines = text.replace(/\r\n/g, NL).split(NL);
  const starts = [];
  lines.forEach((raw, i) => {
    const h = /^#{1,6}[ \t]+(.*)$/.exec(raw);
    const b = h ? null : /^[-*][ \t]+(.*)$/.exec(raw);
    const head = (h ? h[1] : b ? b[1] : "").trim();
    const m = head ? ROW_ID.exec(head) : null;
    if (!m) return;
    starts.push({
      line: i + 1,
      mode: h ? "heading" : "bullet",
      id: m[1],
      rest: head.slice(m[0].length).replace(/^[\s:.\u2014\u2013-]+/, ""),
    });
  });
  const rows = [];
  for (const s of starts) {
    let body = s.rest;
    if (s.mode === "heading") {
      // The body ends at the next heading of any level, so a sub-heading
      // starts a new section rather than swelling the row above it.
      for (let i = s.line; i < lines.length; i++) {
        if (/^#{1,6}[ \t]/.test(lines[i]) || /^[-*][ \t]+/.test(lines[i])) break;
        body += NL + lines[i];
      }
    } else {
      for (let i = s.line; i < lines.length; i++) {
        if (!/^\s+\S/.test(lines[i])) break;
        body += NL + lines[i];
      }
    }
    rows.push({ line: s.line, id: s.id, title: "", body: body.trim(), check: "", kind: "" });
  }
  return { rows, noid: [] };
}

function titleOf(body) {
  const first = collapse(body).split(/ [\u2014\u2013] /)[0];
  const sentence = /^[^.]+\./.exec(first);
  const t = collapse(sentence ? sentence[0] : first).replace(/[.;]$/, "");
  return t.length >= 4 ? t : collapse(body).slice(0, 80);
}

function mintId(child, rowId) {
  const clean = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, "_");
  return "C-" + clean(child).toUpperCase() + "-" + clean(rowId);
}

// How a row travels, from the child's own word. `machine` is the row bound to
// one harness, and `reject` is the child saying, in the contract's own
// vocabulary, that this row is not to be absorbed at all. Reading reject
// through the portable default inverted the instruction and emitted a
// candidate the child had refused; the value is already in the contract's
// enum, so honouring it adds no field.
function portableOf(kind) {
  const k = collapse(kind).toLowerCase();
  if (k === "machine") return "machine";
  if (k === "reject") return "reject";
  return "portable";
}

function trapsCandidate(row, child, rel, at) {
  const split = splitCheck(row.body);
  const check = row.check || split.check;
  const rule = collapse(split.rule) || collapse(row.body);
  const title = row.title || titleOf(row.body) || row.id;
  return {
    id: mintId(child, row.id),
    child,
    at,
    kind: "trap",
    // The row's own id and the file it sits in travel in the title, and the
    // charged line repeats both: that is the provenance that finds the row
    // again, and the contract carries no field for it. Adding one is not
    // enough — intake.mjs holds its own field list and refuses an unknown
    // key, so a new field would fail every candidate at the gate.
    title: row.id + " " + rel + " \u2014 " + title,
    charged: "Charged in " + child + " at " + rel + " row " + row.id + ": " + rule,
    rule,
    check,
    portable: portableOf(row.kind),
  };
}

// One row, two outcomes, and never a third that blurs them: emitted with
// its check, or held with the reason it cannot be.
export function trapsReport(root, child, at) {
  const f = floors();
  const day = at || new Date().toISOString().slice(0, 10);
  const files = tracked(root)
    .filter((x) => TRAPS_FILE.test(x.path))
    .map((x) => x.path)
    .sort();
  const report = { files: [], rows: [] };
  for (const rel of files) {
    const text = readFileSync(join(root, rel), "utf8");
    const parsed = /\.ya?ml$/i.test(rel) ? parseTrapsYaml(text) : parseTrapsMarkdown(text);
    const file = { path: rel, total: parsed.rows.length, named: 0, held: [], noid: parsed.noid };
    const seen = new Set();
    for (const row of parsed.rows) {
      const candidate = trapsCandidate(row, child, rel, day);
      let why = "";
      // A refusal is read before the floors: a reject row that carries a
      // twelve-character check is still a row the child refused. It is held
      // and named by id like any other unemittable row, never given an
      // outcome of its own.
      if (candidate.portable === "reject") why = "kind reject";
      else if (!candidate.check) why = "names no check";
      else if (candidate.check.length < f.check) why = "check under " + f.check;
      else if (candidate.rule.length < f.rule) why = "rule under " + f.rule;
      else if (seen.has(candidate.id)) why = "row id repeated in this file";
      if (why) file.held.push({ id: row.id, why });
      else {
        seen.add(candidate.id);
        file.named += 1;
        report.rows.push(candidate);
      }
    }
    report.files.push(file);
  }
  return report;
}

// Renders parsed rows back to the markdown shape. The live traps.yaml is
// turned into a TRAPS.md this way, so the markdown reader is measured
// against rows a person wrote instead of only against a fixture written to
// agree with the parser.
export function trapsToMarkdown(parsed) {
  const out = [];
  for (const row of parsed.rows) {
    let text = collapse(row.body);
    if (row.title) text = collapse(row.title) + ". " + text;
    // A row that named its check in its own key gets it back as prose, so the
    // markdown reader sees every check the yaml reader saw.
    if (row.check) text = collapse(text) + " Check is " + collapse(row.check) + ".";
    out.push("- " + row.id + " " + text);
  }
  return out.join(NL) + NL;
}

// What a reviewer of a scanned tree would be handed: both counts, every held
// id, and the shape of everything emitted. Every mutant in the self-test runs
// through this one function, so nothing here is a check that cannot fail
// (D-59).
export function trapsProblems(report, want) {
  const problems = [];
  const rows = report.files.reduce((n, f) => n + f.total, 0);
  const named = report.files.reduce((n, f) => n + f.named, 0);
  const noid = report.files.reduce((n, f) => n + f.noid.length, 0);
  if (rows !== want.rows) problems.push("rows " + rows + ", expected " + want.rows);
  if (named !== want.named) problems.push("rows with a check " + named + ", expected " + want.named);
  if (noid !== want.noid) problems.push("rows with no id " + noid + ", expected " + want.noid);
  if (report.rows.length !== want.emit) {
    problems.push("emitted " + report.rows.length + " candidate(s), expected " + want.emit);
  }
  const held = [];
  for (const f of report.files) for (const h of f.held) held.push(h);
  for (const id of want.held) {
    if (!held.some((h) => h.id === id)) problems.push("held row " + id + " is not reported by id");
  }
  for (const h of held) {
    if (want.whyNoCheck.includes(h.id) && h.why !== "names no check") {
      problems.push("held row " + h.id + " says " + h.why + ", not that it names no check");
    }
  }
  for (const row of report.rows) {
    const named2 = / at (\S+) row (\S+):/.exec(row.charged || "");
    if (!row.check) problems.push("emitted " + row.id + " with no check");
    if (!row.child) problems.push("emitted " + row.id + " with no child");
    if (!named2) problems.push("emitted " + row.id + " names no file and row in its provenance");
    else if (!row.title.startsWith(named2[2] + " " + named2[1] + " ")) {
      problems.push("emitted " + row.id + " does not carry its row id and file in the title");
    }
  }
  return problems;
}

// Read-only is proved, not asserted. A path, its size and a hash of its
// bytes: a write anywhere under the root changes this string.
function snapshot(root) {
  const rows = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop();
    for (const name of readdirSync(rel ? join(root, rel) : root)) {
      if (SKIP_DIR.has(name)) continue;
      const childRel = rel ? rel + "/" + name : name;
      const st = statSync(join(root, childRel));
      if (st.isDirectory()) stack.push(childRel);
      else {
        rows.push(
          childRel +
            " " +
            st.size +
            " " +
            createHash("sha1").update(readFileSync(join(root, childRel))).digest("hex").slice(0, 12),
        );
      }
    }
  }
  return rows.sort().join(NL);
}

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

export function scan(root, child) {
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

  // The rows, not only the size of the file they are in. This is the read
  // that T71 was about.
  const traps = trapsReport(root, child || basename(root).toLowerCase());

  return { files: files.length, signals, traps };
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
  const out = ["law".padEnd(14) + "intake".padEnd(8) + "child".padEnd(10) + "title"];
  for (const row of lineage.intakes || []) {
    const law = String(row.absorbedAs || "(none)");
    const known = law.startsWith("T") ? new RegExp("^- id: " + law + "$", "m").test(traps) : true;
    out.push(
      law.padEnd(14) +
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

  const traps = report.traps;
  const total = traps.files.reduce((n, f) => n + f.total, 0);
  const named = traps.files.reduce((n, f) => n + f.named, 0);
  console.log("");
  const col = Math.max(4, ...traps.files.map((f) => f.path.length));
  console.log("TRAPS rows    " + "file".padEnd(col + 2) + "rows  with a check  without");
  for (const f of traps.files) {
    console.log(
      " ".padEnd(14) + f.path.padEnd(col + 2) + String(f.total).padEnd(6) + String(f.named).padEnd(14) + (f.total - f.named),
    );
  }
  console.log(
    "rows " +
      total +
      ", with a check " +
      named +
      ", without a check " +
      (total - named) +
      (traps.files.length ? "" : "  (no TRAPS file in this tree)"),
  );
  console.log("emit " + traps.rows.length + " candidate intake(s)");
  for (const f of traps.files) {
    if (!f.noid.length) continue;
    console.log("  " + f.path + " line(s) " + f.noid.join(", ") + " — a list item with no id is not a row");
  }
  const held = [];
  for (const f of traps.files) {
    for (const h of f.held) held.push(h.id + " (" + h.why + ")");
  }
  if (held.length) console.log("held, not emitted: " + held.join(", "));
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

    // ------------------------------------------- the rows of a TRAPS file
    // Two shapes of the same rows, and a third shape of the live file. The
    // markdown row that names no check and the yaml row that names none are
    // held by id, never emitted: the gate refuses a checkless intake, and a
    // refused intake is noise the owner learns to skip (T24).
    const mdRows = [
      "- T1 Keep the seat under its cap. Check is node factory/tools/size.mjs reports ok.",
      "- T2 A rule with no check is a diary, and this row is one.",
      "- T7 A check that is too short is refused. Check: TODO.",
      // T8 carries incidental "check is" prose before its real directive: a
      // first-match reader emits the prose tail as the check, a junk check
      // that clears the floor and reaches the owner. T9's rule only clears
      // its floor once the directive is the one cut at, so a first-match
      // reader holds it as checkless.
      "- T8 Confirm the box. check is ticked before merge, always. Check is node factory/tools/kitCheck.mjs --self-test.",
      "- T9 Do it. check is fine. Check is node factory/tools/kitCheck.mjs --self-test.",
      // T10 carries two capital-C directives on two lines: the prose one
      // first, the row's real one last. Only the last-wins take emits the
      // real one. T8's red is the case-sensitivity alone and T10's is
      // last-wins alone: neither row can red for the other's reason.
      "- T10 The row's prose names an earlier directive.",
      "  Check: node factory/tools/proseCheck.mjs --self-test.",
      "  The rule still clears its floor, and the row ends with the directive that counts.",
      "  Check is node factory/tools/kitCheck.mjs --self-test.",
      "",
      "Prose in a TRAPS file is not a row: it is not a bullet, and it carries no id.",
    ].join(NL) + NL;
    const yamlRows =
      "- id: T3" + NL +
      "  kind: machine" + NL +
      "  title: The harness eats the exit code" + NL +
      "  rule: A wrapped rule that" + NL +
      "    continues on the next line, and names its check inside." + NL +
      "  Check is node factory/tools/seat.mjs --self-test goes green." + NL +
      "- id: T4" + NL +
      "  title: A row that names nothing to run" + NL +
      "  rule: This rule is long enough to clear the floor, and stops there." + NL +
      // T6 quotes its id, its kind and its check, which YAML permits anywhere.
      // Its rule quotes itself as well and keeps an apostrophe inside: the
      // quotes go, the apostrophe stays.
      "- id: \"T6\"" + NL +
      "  kind: 'machine'" + NL +
      "  title: \"The quotes are not the value\"" + NL +
      "  rule: \"A rule that keeps its child's apostrophe and clears the floor.\"" + NL +
      "  check: \"node factory/tools/kitCheck.mjs --self-test\"" + NL +
      // T11's kind is the child's own word for do-not-absorb, and its rule and
      // its check both clear their floors: nothing but the kind holds it.
      "- id: T11" + NL +
      "  kind: reject" + NL +
      "  title: A row the child refuses to have absorbed" + NL +
      "  rule: This rule clears its floor and its check clears the check floor." + NL +
      "  check: node factory/tools/kitCheck.mjs --self-test." + NL +
      "-" + NL +
      "  title: A list item with no id is not a row" + NL;
    const ymlRows =
      "- id: T5" + NL +
      "  title: The second yaml extension reaches the same reader" + NL +
      "  rule: One rule and one check, written as an explicit key." + NL +
      "  check: node factory/tools/kitCheck.mjs exits zero." + NL;

    const liveTraps = readFileSync(join(kitRoot, "factory/traps.yaml"), "utf8");
    const rowsTree = fixture({
      "docs/TRAPS.md": mdRows,
      "docs/TRAPS.yaml": yamlRows,
      "ops/TRAPS.yml": ymlRows,
      "src/app.js": "ok",
    });
    const corpusTree = fixture({
      "docs/TRAPS.md": trapsToMarkdown(parseTrapsYaml(liveTraps)),
      "factory/TRAPS.yaml": liveTraps,
    });
    try {
      const want = {
        rows: 11,
        named: 7,
        noid: 1,
        emit: 7,
        held: ["T2", "T7", "T4", "T11"],
        whyNoCheck: ["T2", "T4"],
      };
      const before = snapshot(rowsTree);
      const traps = trapsReport(rowsTree, "otto", "2026-09-21");
      if (snapshot(rowsTree) !== before) errors.push("reading a TRAPS file wrote into the scanned tree");
      const problems = trapsProblems(traps, want);
      if (problems.length) errors.push("traps report: " + problems.join("; "));

      // The two halves of the match are asserted on the emitted rows, not on
      // a count: a junk check that clears the floor changes no count, and a
      // row held for the wrong reason looks like any other held row. T8's
      // prose says "check is" before the directive, and T9's rule only clears
      // the floor when the directive, not the prose, is what was cut at.
      const emitted = new Map(traps.rows.map((r) => [r.id, r]));
      const t8 = emitted.get("C-OTTO-T8");
      const t9 = emitted.get("C-OTTO-T9");
      if (!t8 || t8.check !== "node factory/tools/kitCheck.mjs --self-test") {
        errors.push("prose beat the directive: T8 check is " + JSON.stringify(t8 && t8.check));
      }
      if (!t9 || t9.check !== "node factory/tools/kitCheck.mjs --self-test") {
        errors.push(
          "a false early hit held a row that carries a check: T9 " +
            (t9 ? JSON.stringify(t9.check) : "held, not emitted"),
        );
      }

      // T10's red is last-wins alone: two capital-C directives, the prose one
      // first and the row's real one last, so a first-match take emits the
      // prose tail as the check of a row that carries a good one.
      const t10 = emitted.get("C-OTTO-T10");
      if (!t10 || t10.check !== "node factory/tools/kitCheck.mjs --self-test") {
        errors.push(
          "an earlier directive won over the row's real one: T10 check is " +
            JSON.stringify(t10 ? t10.check : "held, not emitted"),
        );
      }

      // T6's red is the unquoting alone, and it is asserted on the parsed
      // values first so the failure names the value that carried its quotes
      // into the tree, then on the emitted candidate so the values are proved
      // to reach the parent. A quoted row does not change a count: it is
      // emitted under a minted id that names no row.
      const y6 = parseTrapsYaml(yamlRows).rows.find((r) => String(r.body).includes("apostrophe"));
      if (!y6) errors.push("the quoted fixture row did not parse as a row");
      else {
        if (y6.id !== "T6") {
          errors.push("a quoted id carried its quotes into the value: T6 id is " + JSON.stringify(y6.id));
        }
        if (y6.kind !== "machine") {
          errors.push("a quoted kind carried its quotes into the value: T6 kind is " + JSON.stringify(y6.kind));
        }
        if (y6.title !== "The quotes are not the value") {
          errors.push("a quoted title carried its quotes into the value: T6 title is " + JSON.stringify(y6.title));
        }
        if (y6.check !== "node factory/tools/kitCheck.mjs --self-test") {
          errors.push("a quoted check carried its quotes into the value: T6 check is " + JSON.stringify(y6.check));
        }
        if (y6.body !== "A rule that keeps its child's apostrophe and clears the floor.") {
          errors.push("the unquoting mangled the rule: T6 rule is " + JSON.stringify(y6.body));
        }
      }
      const t6 = emitted.get("C-OTTO-T6");
      if (!t6) {
        errors.push("a quoted id carried its quotes into the value: no candidate C-OTTO-T6");
      } else {
        if (t6.portable !== "machine") {
          errors.push("a quoted kind carried its quotes into the value: T6 portable is " + JSON.stringify(t6.portable));
        }
        if (t6.check !== "node factory/tools/kitCheck.mjs --self-test") {
          errors.push("a quoted check carried its quotes into the value: T6 check is " + JSON.stringify(t6.check));
        }
        if (!t6.title.endsWith("The quotes are not the value")) {
          errors.push("a quoted title carried its quotes into the value: T6 title is " + JSON.stringify(t6.title));
        }
        if (t6.rule !== "A rule that keeps its child's apostrophe and clears the floor.") {
          errors.push("the unquoting mangled the rule: T6 rule is " + JSON.stringify(t6.rule));
        }
      }

      // T11's red is the refusal alone: its kind is the child's word for
      // do-not-absorb, so it must be held with that reason and never emitted,
      // named by id the way a row that names no check already is.
      const heldById = new Map();
      for (const file of traps.files) for (const h of file.held) heldById.set(h.id, h.why);
      if (emitted.has("C-OTTO-T11")) {
        errors.push("a row that refused absorption was emitted: C-OTTO-T11");
      }
      if (heldById.get("T11") !== "kind reject") {
        errors.push(
          "a row whose kind is reject is held with reason " +
            JSON.stringify(heldById.get("T11")) +
            ", not kind reject",
        );
      }

      // The read-only check can fail: a write anywhere under the root has to
      // move it, and undoing the write has to put it back.
      fsMod.writeFileSync(join(rowsTree, "docs/TRAPS.md"), mdRows + NL);
      if (snapshot(rowsTree) === before) errors.push("the read-only snapshot did not notice a write");
      fsMod.writeFileSync(join(rowsTree, "docs/TRAPS.md"), mdRows);
      if (snapshot(rowsTree) !== before) errors.push("the read-only snapshot did not come back when the write was undone");

      // D-59: each mutant is a report this code could have produced, and each
      // one runs through the same assertion the green run above used.
      const mutants = [
        [
          "the parser returns no rows for a TRAPS file that has some",
          { rows: [], files: traps.files.map((f) => ({ ...f, total: 0, named: 0, held: [] })) },
        ],
        [
          "a checkless row is emitted as an intake",
          { ...traps, rows: traps.rows.concat([{ ...traps.rows[0], id: "C-OTTO-T2", check: "" }]) },
        ],
        [
          "an emitted candidate carries no child",
          { ...traps, rows: traps.rows.map((r, i) => (i === 0 ? { ...r, child: "" } : r)) },
        ],
      ];
      for (const [name, mutant] of mutants) {
        if (!trapsProblems(mutant, want).length) errors.push("mutant not caught: " + name);
      }

      // Everything emitted passes the parent's own gate with no hand-editing.
      traps.rows.forEach((row, i) => {
        const f = join(rowsTree, "..", "trap-cand-" + i + ".json");
        fsMod.writeFileSync(f, JSON.stringify(row, null, 2));
        const run = spawnSync(process.execPath, [join(kitRoot, "factory/tools/intake.mjs"), f], {
          encoding: "utf8",
        });
        if (run.status !== 0) {
          errors.push("emitted trap intake fails the gate: " + (run.stderr || run.stdout || "").trim());
        }
        fsMod.rmSync(f, { force: true });
      });

      // Two fields the gate refuses, driven so that the refusal is the gate's
      // and not this file's opinion.
      const bad = join(rowsTree, "..", "trap-cand-bad.json");
      for (const [field, empty, wants] of [
        ["check", "", /check/],
        ["child", "", /child/],
      ]) {
        fsMod.writeFileSync(bad, JSON.stringify({ ...traps.rows[0], [field]: empty }, null, 2));
        const run = spawnSync(process.execPath, [join(kitRoot, "factory/tools/intake.mjs"), bad], {
          encoding: "utf8",
        });
        const said = run.stderr || run.stdout || "";
        if (run.status === 0 || !wants.test(said)) {
          errors.push("intake.mjs did not refuse an empty " + field + ": " + said.trim());
        }
      }
      fsMod.rmSync(bad, { force: true });

      // The live rows, in two shapes, read by two readers. A markdown reader
      // that only agreed with the fixture written for it would agree here too
      // and still be wrong, so the same file is parsed as yaml and as
      // markdown and the two readings are compared to each other.
      const seen = trapsReport(corpusTree, "corpus", "2026-09-21");
      const byRel = new Map(seen.files.map((f) => [f.path, f]));
      const asMd = byRel.get("docs/TRAPS.md");
      const asYaml = byRel.get("factory/TRAPS.yaml");
      if (!asMd || !asYaml) errors.push("the corpus drive did not read both shapes of the live rows");
      else {
        if (asMd.total !== asYaml.total) {
          errors.push("live rows: markdown reads " + asMd.total + ", yaml reads " + asYaml.total);
        }
        if (asMd.named !== asYaml.named) {
          errors.push("live rows: markdown names " + asMd.named + " checks, yaml names " + asYaml.named);
        }
        if (seen.rows.length !== asMd.named + asYaml.named) {
          errors.push(
            "live rows: emitted " +
              seen.rows.length +
              " candidates for " +
              (asMd.named + asYaml.named) +
              " rows naming a check across two files",
          );
        }
        // The same rows, written both ways, mint the same ids: the two
        // readers did not merely agree on a count.
        const distinct = new Set(seen.rows.map((r) => r.id)).size;
        if (distinct !== asYaml.named) {
          errors.push("live rows: " + distinct + " distinct candidates for " + asYaml.named + " rows naming a check");
        }
      }
    } finally {
      fsMod.rmSync(rowsTree, { recursive: true, force: true });
      fsMod.rmSync(corpusTree, { recursive: true, force: true });
    }

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

  // Importing this file must be inert. Without the entry guard, argv[2] is
  // undefined on import, cmd defaults to "checks", and the whole check pack
  // is printed into the importer and the process exits — a gate step that
  // cannot fail (T14). Spawned against this file's own URL, so a mutated copy
  // under any name is measured for what it is, not for the file it was
  // copied from. Any output at all is a failure: the guard's job is silence.
  const importer = spawnSync(
    process.execPath,
    ["-e", "import(" + JSON.stringify(import.meta.url) + ")"],
    { encoding: "utf8" },
  );
  const imported = (importer.stdout || "") + (importer.stderr || "");
  if (importer.status !== 0 || imported.trim()) {
    errors.push(
      "importing the module ran its CLI: exit " +
        importer.status +
        " " +
        imported.trim().split(NL)[0],
    );
  }

  if (errors.length) {
    console.error("alumni self-test failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("alumni self-test ok");
  process.exit(0);
}

// Dispatch only for the entry point. Imported, this file must be inert: a
// test imports the readers below, and a dispatch that ran would print the
// check pack and exit the importer (T14).
if (isEntry) {
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
    const child = process.argv[4] || basename(root).toLowerCase();
    const report = scan(root, child);
    if (cmd === "scan") {
      printScan(root, report);
      process.exit(0);
    }
    const at = new Date().toISOString().slice(0, 10);
    // Two sources, one shape: the size signals and the rows of the child's
    // own TRAPS file. Everything here already cleared the contract's floors.
    console.log(JSON.stringify([...intakeRows(child, report, at), ...report.traps.rows], null, 2));
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
}
