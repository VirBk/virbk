#!/usr/bin/env node
// A ZERO that did not name its containers is not a finding.
//
//   node factory/tools/scopeSearch.mjs TOKEN [TOKEN...]
//   node factory/tools/scopeSearch.mjs --self-test
//
// Always prints every container, including the empty ones.

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const CONTAINERS = [
  "board-now",
  "board-rest",
  "docs",
  "source",
  "tests",
  "other",
];

const DOC_EXT = new Set([".md", ".html", ".htm", ".yaml", ".yml"]);
const SRC_EXT = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
]);
const SKIP_DIR = new Set(["node_modules", ".git"]);
const SKIP_FILE = new Set(["package-lock.json"]);

const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = join(here, "../..");

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function gitTracked(root) {
  const r = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((rel) => join(root, rel));
}

function listFiles(root) {
  return gitTracked(root) || walk(root, []);
}

function isTest(rel) {
  const base = rel.split(sep).pop() || "";
  const n = rel.replaceAll("\\", "/");
  return (
    /\.(test|spec)\./i.test(base) ||
    /self-test/i.test(base) ||
    /(^|\/)(test|tests|__tests__)(\/|$)/i.test(n)
  );
}

function isBoard(rel) {
  const n = rel.replaceAll("\\", "/");
  return n === "BOARD.md" || n === "factory/board.json";
}

function containerOf(rel) {
  if (isBoard(rel)) return "board";
  if (isTest(rel)) return "tests";
  const ext = extname(rel).toLowerCase();
  if (DOC_EXT.has(ext)) return "docs";
  const base = rel.split(sep).pop() || "";
  if (SRC_EXT.has(ext) && !SKIP_FILE.has(base)) return "source";
  return "other";
}

function countIn(text, lowerToken) {
  if (!text) return 0;
  const hay = text.toLowerCase();
  let n = 0;
  let i = 0;
  while ((i = hay.indexOf(lowerToken, i)) !== -1) {
    n += 1;
    i += lowerToken.length;
  }
  return n;
}

function splitBoard(text, token, rel) {
  const lower = token.toLowerCase();
  const n = rel.replaceAll("\\", "/");
  if (n === "factory/board.json") {
    let nowText = "";
    try {
      nowText = String(JSON.parse(text).now || "");
    } catch {
      nowText = "";
    }
    const now = countIn(nowText, lower);
    const total = countIn(text, lower);
    return { now, rest: Math.max(0, total - now) };
  }
  const lines = text.split(/\r?\n/);
  const gate = lines.findIndex((l) => /^## Gates\s*$/.test(l));
  const cut = gate === -1 ? Math.min(40, lines.length) : gate;
  return {
    now: countIn(lines.slice(0, cut).join("\n"), lower),
    rest: countIn(lines.slice(cut).join("\n"), lower),
  };
}

function searchRoot(root, token) {
  const lower = token.toLowerCase();
  const files = listFiles(root).filter((p) => {
    const rel = relative(root, p);
    return !SKIP_FILE.has(rel.split(sep).pop() || "");
  });
  const buckets = Object.fromEntries(
    CONTAINERS.map((c) => [c, { hits: 0, files: [] }]),
  );

  for (const abs of files) {
    const rel = relative(root, abs).replaceAll("\\", "/");
    if (!existsSync(abs)) continue;
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const kind = containerOf(rel);
    if (kind === "board") {
      const { now, rest } = splitBoard(text, token, rel);
      if (now) {
        buckets["board-now"].hits += now;
        buckets["board-now"].files.push(rel);
      }
      if (rest) {
        buckets["board-rest"].hits += rest;
        buckets["board-rest"].files.push(rel);
      }
      continue;
    }
    const n = countIn(text, lower);
    if (!n) continue;
    buckets[kind].hits += n;
    buckets[kind].files.push(rel);
  }

  const total = CONTAINERS.reduce((s, c) => s + buckets[c].hits, 0);
  return {
    token,
    opened: [...CONTAINERS],
    containers: buckets,
    hits: total,
    verdict: total > 0 ? "found" : "absent",
  };
}

function printReport(report) {
  const lines = [
    `token\t${report.token}`,
    `verdict\t${report.verdict}`,
    `opened\t${report.opened.join(",")}`,
  ];
  for (const c of report.opened) {
    const b = report.containers[c];
    const files = b.files.length ? b.files.join(",") : "-";
    lines.push(`${c}\t${b.hits}\t${files}`);
  }
  lines.push(`hits\t${report.hits}`);
  console.log(lines.join("\n"));
}

function fail(label, errors) {
  console.error(label);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

function writeTree(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
}

function selfTest() {
  const errors = [];
  const dir = mkdtempSync(join(tmpdir(), "scope-search-"));
  try {
    writeTree(dir, {
      "BOARD.md": [
        "# BOARD",
        "",
        "## Now",
        "",
        "Queue: LEAVE-SWEEPNET, CP-QUEUE-TOKEN, PK-XAUDIT.",
        "",
        "## Gates",
        "",
        "## Lanes",
        "",
        "| Lane | What it closes |",
        "| --- | --- |",
        "| **CP-TABLE-TOKEN** | The tax-elections panel. |",
        "",
      ].join("\n"),
      "factory/board.json": '{"now":"CP-QUEUE-TOKEN in now"}\n',
      "docs/note.md": "docs mention nothing of the source-only token.\n",
      "src/people/elections.ts":
        "/* CP-SOURCE-TOKEN renders this at organization scope */\n",
      "src/elections.test.ts": "describe('plain');\n",
    });

    const sourceOnly = searchRoot(dir, "CP-SOURCE-TOKEN");
    if (sourceOnly.verdict !== "found") {
      errors.push("source-only token reported " + sourceOnly.verdict);
    }
    if (sourceOnly.containers.source.hits < 1) {
      errors.push("source-only token missed the source container");
    }
    if (sourceOnly.containers.docs.hits !== 0) {
      errors.push("source-only token leaked into docs");
    }
    if (sourceOnly.opened.join(",") !== CONTAINERS.join(",")) {
      errors.push("opened list drifted: " + sourceOnly.opened.join(","));
    }
    const docsOnlyMiss =
      sourceOnly.containers.docs.hits +
        sourceOnly.containers["board-now"].hits +
        sourceOnly.containers["board-rest"].hits ===
        0 && sourceOnly.containers.source.hits > 0;
    if (!docsOnlyMiss) {
      errors.push("fixture no longer demonstrates the markdown-only miss");
    }

    const table = searchRoot(dir, "CP-TABLE-TOKEN");
    if (table.containers["board-rest"].hits < 1) {
      errors.push("wave-table token missed board-rest");
    }
    if (table.verdict !== "found") {
      errors.push("wave-table token reported " + table.verdict);
    }

    const queue = searchRoot(dir, "CP-QUEUE-TOKEN");
    if (queue.containers["board-now"].hits < 1) {
      errors.push("queue token missed board-now");
    }

    const absent = searchRoot(dir, "CP-ABSENT-TOKEN");
    if (absent.verdict !== "absent") {
      errors.push("absent token reported " + absent.verdict);
    }
    for (const c of CONTAINERS) {
      if (absent.containers[c].hits !== 0) {
        errors.push("absent token hit " + c);
      }
    }
    if (absent.opened.length !== CONTAINERS.length) {
      errors.push("absent report omitted a container");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const cp = readFileSync(join(kitRoot, "factory/CONTROL_PLANE.md"), "utf8");
  if (!/hosted or private-index code search/i.test(cp)) {
    errors.push("CONTROL_PLANE.md does not name a hosted search zero as not a ZERO (T57)");
  }

  const kit = searchRoot(kitRoot, "scopeSearch");
  if (kit.verdict !== "found") {
    errors.push("the kit does not find its own tool name");
  }

  if (errors.length) fail("scopeSearch self-test failed", errors);
  console.log("scopeSearch self-test ok");
}

const args = process.argv.slice(2);
if (args[0] === "--self-test") {
  selfTest();
  process.exit(0);
}

if (!args.length || args[0].startsWith("-")) {
  console.error(
    "usage: node factory/tools/scopeSearch.mjs TOKEN [TOKEN...] | --self-test",
  );
  process.exit(1);
}

const root = existsSync(join(process.cwd(), "factory/tools/scopeSearch.mjs"))
  ? process.cwd()
  : kitRoot;

for (const token of args) {
  printReport(searchRoot(root, token));
  if (args.length > 1) console.log("");
}
