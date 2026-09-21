#!/usr/bin/env node
// The checks the kit owes itself. Every rule here caught a live defect.
//
//   node factory/tools/kitCheck.mjs
//   node factory/tools/kitCheck.mjs --self-test
//
// A  every tracked .json parses             (packages.json shipped broken)
// B  plan and board agree on lanes          (F21 was missing from the plan)
// C  a lane log the board names exists      (F15 named a deleted file)
// D  the parent guard names the live remote (the guard named a dead repo)
// E  no live doc restates lane state        (CONSOLE was three lanes stale)
// F  every gate step names a file that is here
// G  every tool is named by a gate step
// H  a record cites only a path that resolves  (a log cited evidence that never existed)
// I  a date field is not ahead of UTC          (rows were dated from a local clock)

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "coverage"]);

// History and pastes: they record what was true then, not what is true.
const HISTORY = [
  "BOARD.md",
  "factory/board.json",
  "factory/decisions.json",
  "factory/concerns.json",
  "factory/lineage.json",
  "docs/",
  "factory/drops/",
];

const LIVE_DOCS = [
  "README.md",
  "AGENTS.md",
  "factory/COPY.md",
  "factory/CONSOLE.md",
  "factory/CONTROL_PLANE.md",
  "factory/OPERATING_MODEL.md",
  "factory/HANDS.md",
  "factory/ASSESSMENT.md",
];

const STATE_WORD = /\b(landed|dropped|issued|queued|split)\b/i;
const LANE_ID = /\bF\d+\b/;

// A path citation is a backticked token that names a file. Globs and
// placeholders are not citations, and neither is prose.
const CITATION_EXT = /\.(mjs|json|yaml|yml|md|js|ts)$/;

// The five paths a record cites that do not resolve in this tree, each
// for a reason. An entry that starts resolving is stale and fails.
const CITATION_ALLOW = [
  { path: "factory/envelopes/F33.md", why: "an envelope is deleted at landing (AGENTS sec 3)" },
  { path: "factory/help.json", why: "named by T47, written only when helpMode is not none" },
  { path: "docs/log/landing-checkout.md", why: "cited by f21.md and never written" },
  { path: "factory/not-in-the-tree.md", why: "a deliberate absent-file example in f36.md's prose" },
  { path: "tools/check.yml", why: "a path in a CHILD's tree, not this one" },
];

function pathCitations(text) {
  const out = [];
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const tok = m[1];
    if (!tok.includes("/")) continue;
    if (/\s/.test(tok)) continue;
    if (/[*<>?]/.test(tok)) continue;
    if (!CITATION_EXT.test(tok)) continue;
    out.push(tok);
  }
  return out;
}

function walk(dir, root, acc) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, root, acc);
    else acc.push(relative(root, p).split("\\").join("/"));
  }
  return acc;
}

function files(root) {
  const r = spawnSync("git", ["-C", root, "ls-files"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status === 0) return (r.stdout || "").split(NL).filter(Boolean);
  return walk(root, root, []);
}

function read(root, rel) {
  return readFileSync(join(root, rel), "utf8");
}

function json(root, rel) {
  return JSON.parse(read(root, rel));
}

function isHistory(rel) {
  return HISTORY.some((h) => (h.endsWith("/") ? rel.startsWith(h) : rel === h));
}

export function check(root) {
  const errors = [];
  const all = files(root);

  // A — a state file no check parses is a state file that is wrong.
  for (const rel of all) {
    if (!rel.endsWith(".json")) continue;
    if (!existsSync(join(root, rel))) continue;
    try {
      JSON.parse(read(root, rel));
    } catch (err) {
      const first = String(err.message || err).split(NL)[0];
      errors.push("A " + rel + " does not parse: " + first);
    }
  }

  let board = null;
  try {
    board = json(root, "factory/board.json");
  } catch {
    errors.push("A factory/board.json does not parse");
    return errors;
  }

  // B — two files holding lane state drift in silence.
  if (existsSync(join(root, "factory/packages.json"))) {
    let plan = null;
    try {
      plan = json(root, "factory/packages.json");
    } catch {
      plan = null;
    }
    if (plan) {
      const rows = new Map((plan.packages || []).map((p) => [p.id, p.status]));
      for (const lane of board.lanes || []) {
        if (!rows.has(lane.id)) {
          errors.push("B factory/packages.json has no row for board lane " + lane.id);
          continue;
        }
        if (rows.get(lane.id) !== lane.state) {
          errors.push(
            "B " + lane.id + " plan says " + rows.get(lane.id) + ", board says " + lane.state,
          );
        }
      }
      for (const id of rows.keys()) {
        if (!(board.lanes || []).some((l) => l.id === id)) {
          errors.push("B factory/packages.json names lane " + id + ", the board does not");
        }
      }
    }
  }

  // C — the board may not name a record that is not in the tree.
  for (const lane of board.lanes || []) {
    const holds = String(lane.hold || "").match(/docs\/log\/[A-Za-z0-9._-]+\.md/g) || [];
    for (const path of holds) {
      if (!existsSync(join(root, path))) {
        errors.push("C lane " + lane.id + " holds " + path + ", which is not in the tree");
      }
    }
  }

  // D — the parent guard has to name the remote that exists.
  let lineage = null;
  try {
    lineage = json(root, "factory/lineage.json");
  } catch {
    lineage = null;
  }
  if (lineage) {
    const parent = String(lineage.parent || "");
    const remote = String(board.remote || "");
    if (parent.toLowerCase() !== remote.toLowerCase()) {
      errors.push("D lineage parent " + parent + " is not the board remote " + remote);
    }
    const known = new Set(
      [remote, ...(board.references || []), parent].filter(Boolean).map((s) => s.toLowerCase()),
    );
    const owner = remote.split("/")[0] || "VirBk";
    const re = new RegExp(owner + "/[A-Za-z0-9_.-]+", "g");
    for (const rel of all) {
      if (isHistory(rel) || !existsSync(join(root, rel))) continue;
      let text;
      try {
        text = read(root, rel);
      } catch {
        continue;
      }
      const named = text.match(re) || [];
      for (const raw of named) {
        const one = raw.replace(/[.,)]+$/, "");
        if (!known.has(one.toLowerCase())) {
          errors.push("D " + rel + " names " + one + ", which is not the remote or a reference");
        }
      }
    }
  }

  // E — a second place that says what a lane did is a second board.
  for (const rel of LIVE_DOCS) {
    if (!existsSync(join(root, rel))) continue;
    const lines = read(root, rel).split(NL);
    lines.forEach((line, i) => {
      if (LANE_ID.test(line) && STATE_WORD.test(line)) {
        errors.push("E " + rel + ":" + (i + 1) + " restates lane state; the board is the board");
      }
    });
  }

  // F and G — a gate step that names nothing; a tool no gate names.
  let landing = null;
  try {
    landing = json(root, "factory/landing-checks.json");
  } catch {
    landing = null;
  }
  if (landing) {
    const runs = (landing.steps || []).map((s) => String(s.run || "")).join(" ");
    const named = (runs.match(/[A-Za-z0-9_./-]+\.(mjs|json|yml|js)/g) || []).filter((t) => t.includes("/"));
    for (const path of named) {
      if (!existsSync(join(root, path))) {
        errors.push("F landing step names " + path + ", which is not in the tree");
      }
    }
    const toolsDir = join(root, "factory/tools");
    if (existsSync(toolsDir)) {
      for (const name of readdirSync(toolsDir)) {
        if (!name.endsWith(".mjs")) continue;
        if (!runs.includes("factory/tools/" + name)) {
          errors.push("G factory/tools/" + name + " is named by no gate step");
        }
      }
    }
  }

  // H — a record may cite only a path that resolves in the commit under
  // test. A citation that resolves to nothing is evidence that never was.
  const allow = new Set(CITATION_ALLOW.map((e) => e.path));
  for (const entry of CITATION_ALLOW) {
    if (!entry.why || entry.why.includes(NL)) {
      errors.push("H citation allowlist entry " + entry.path + " has no one-line why");
    }
    if (existsSync(join(root, entry.path))) {
      errors.push("H citation allowlist entry " + entry.path + " resolves; a stale exemption is a lie");
    }
  }
  const logDir = join(root, "docs/log");
  if (existsSync(logDir)) {
    for (const name of readdirSync(logDir)) {
      if (!name.endsWith(".md")) continue;
      const rel = "docs/log/" + name;
      for (const tok of pathCitations(read(root, rel))) {
        if (allow.has(tok)) continue;
        if (!existsSync(join(root, tok))) {
          errors.push("H " + rel + " cites " + tok + ", which is not in the tree");
        }
      }
    }
  }

  // I — a date field is never ahead of the UTC date read in the same act
  // as the comparison (T04). Fields only; prose is not scanned.
  const utc = new Date().toISOString().slice(0, 10);
  const dated = [];
  if (existsSync(join(root, "factory/decisions.json"))) {
    let decisions = null;
    try {
      decisions = json(root, "factory/decisions.json");
    } catch {
      decisions = null;
    }
    for (const row of (decisions && decisions.decisions) || []) {
      dated.push(["factory/decisions.json", "row " + (row.id == null ? "?" : row.id), row.at]);
    }
  }
  (board.ledger || []).forEach((row, i) => {
    const id = row.id == null ? "ledger[" + i + "]" : row.id;
    dated.push(["factory/board.json ledger", "row " + id, row.at]);
  });
  for (const [where, id, at] of dated) {
    const s = at == null ? "" : String(at);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      errors.push("I " + where + " " + id + " has at " + JSON.stringify(at) + ", not a YYYY-MM-DD");
    } else if (s > utc) {
      errors.push("I " + where + " " + id + " is dated " + s + ", ahead of UTC " + utc);
    }
  }

  return errors;
}

const BOARD_MIN = {
  now: "fixture",
  remote: "VirBk/virbk",
  references: [],
  gates: [],
  lanes: [{ id: "F1", title: "t", state: "landed", hold: "none" }],
  keystones: [],
  holds: [],
  shelf: [],
  ledger: [],
};

function fixture(tree) {
  const dir = mkdtempSync(join(tmpdir(), "kit-check-"));
  try {
    for (const rel of Object.keys(tree)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, tree[rel]);
    }
    return check(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Built from parts: the rule scans every tracked file, and a fixture
// literal in this file would be a finding about this file.
const DEAD_PARENT = "Vir" + "Bk/Gr" + "ok";
const STRAY_REMOTE = "Vir" + "Bk/Now" + "here";

function selfTest() {
  const errors = [];
  const base = {
    "factory/board.json": JSON.stringify(BOARD_MIN),
    "factory/lineage.json": JSON.stringify({ parent: "VirBk/virbk" }),
    "factory/packages.json": JSON.stringify({ packages: [{ id: "F1", status: "landed" }] }),
  };

  const clean = fixture(base);
  if (clean.length) errors.push("clean fixture should pass: " + clean.join("; "));

  const cases = [
    ["A", { ...base, "factory/extra.json": "{ not json" }],
    ["B", { ...base, "factory/packages.json": JSON.stringify({ packages: [{ id: "F1", status: "dropped" }] }) }],
    [
      "C",
      {
        ...base,
        "factory/board.json": JSON.stringify({
          ...BOARD_MIN,
          lanes: [{ id: "F1", title: "t", state: "landed", hold: "docs/log/f1.md" }],
        }),
      },
    ],
    ["D", { ...base, "factory/lineage.json": JSON.stringify({ parent: DEAD_PARENT }) }],
    ["D", { ...base, "README.md": "push to " + STRAY_REMOTE + NL }],
    ["E", { ...base, "factory/CONSOLE.md": "F7 landed this sitting." + NL }],
    [
      "F",
      {
        ...base,
        "factory/landing-checks.json": JSON.stringify({
          steps: [{ name: "x", run: "node factory/tools/ghost.mjs" }],
        }),
      },
    ],
  ];

  for (const [letter, tree] of cases) {
    const found = fixture(tree);
    if (!found.some((e) => e.startsWith(letter + " "))) {
      errors.push("case " + letter + " did not fail: " + found.join("; "));
    }
  }

  const live = check(kitRoot);
  for (const e of live) errors.push("live: " + e);

  if (errors.length) {
    console.error("kitCheck self-test failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("kitCheck self-test ok");
  process.exit(0);
}

if (process.argv[2] === "--self-test") selfTest();

const found = check(kitRoot);
if (found.length) {
  console.error("kit check failed");
  for (const e of found) console.error("  " + e);
  process.exit(1);
}
console.log("kit check ok");
