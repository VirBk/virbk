#!/usr/bin/env node
// The ledger is history. History is git. Only the live window belongs in
// the file every seat reads.
//
//   node factory/tools/ledger.mjs --check
//   node factory/tools/ledger.mjs rotate
//   node factory/tools/ledger.mjs --self-test
//
// Rotate moves every row older than the live window into
// docs/ledger/<YYYY-MM>.md, one line per row, in date order. Nothing is
// deleted: a dropped row is a deletion git would show.

import {
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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const ARCHIVE_DIR = "docs/ledger";

function read(root, rel) {
  return readFileSync(join(root, rel), "utf8");
}

function json(root, rel) {
  return JSON.parse(read(root, rel));
}

function liveRows(root) {
  const b = json(root, "factory/budgets.json");
  const n = Number((b.context || {}).ledgerRows);
  return Number.isInteger(n) && n > 0 ? n : 12;
}

function month(at) {
  return String(at || "").slice(0, 7) || "undated";
}

function line(row) {
  return "- " + row.at + " " + String(row.event || "").split(NL).join(" ");
}

export function checkErrors(root) {
  const errors = [];
  const cap = liveRows(root);
  const board = json(root, "factory/board.json");
  const rows = board.ledger || [];
  if (rows.length > cap) {
    errors.push(
      "live ledger has " +
        rows.length +
        " rows, window is " +
        cap +
        " — run node factory/tools/ledger.mjs rotate",
    );
  }
  const dir = join(root, ARCHIVE_DIR);
  if (existsSync(dir)) {
    const oldest = rows.length ? rows[0].at : "9999-99";
    const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      for (const l of text.split(NL)) {
        const m = /^- (\d{4}-\d{2}-\d{2}) /.exec(l);
        if (m && m[1] > oldest) {
          errors.push(ARCHIVE_DIR + "/" + f + " holds " + m[1] + ", newer than the live window");
          break;
        }
      }
    }
  }
  return errors;
}

export function rotate(root, { write = true } = {}) {
  const cap = liveRows(root);
  const board = json(root, "factory/board.json");
  const rows = board.ledger || [];
  if (rows.length <= cap) return { moved: 0, kept: rows.length, files: [] };
  const cut = rows.length - cap;
  const older = rows.slice(0, cut);
  const live = rows.slice(cut);
  const byMonth = new Map();
  for (const row of older) {
    const key = month(row.at);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(row);
  }
  const files = [];
  if (write) {
    mkdirSync(join(root, ARCHIVE_DIR), { recursive: true });
    for (const [key, group] of byMonth) {
      const rel = ARCHIVE_DIR + "/" + key + ".md";
      const abs = join(root, rel);
      const head = "# Ledger " + key + NL + NL + "Archived from factory/board.json. History, not the reading path." + NL + NL;
      const prev = existsSync(abs) ? readFileSync(abs, "utf8") : head;
      const body = prev.endsWith(NL) ? prev : prev + NL;
      writeFileSync(abs, body + group.map(line).join(NL) + NL);
      files.push(rel);
    }
    board.ledger = live;
    writeFileSync(join(root, "factory/board.json"), JSON.stringify(board, null, 2) + NL);
  }
  return { moved: older.length, kept: live.length, files };
}

function selfTest() {
  const errors = [];
  const dir = mkdtempSync(join(tmpdir(), "grok-ledger-"));
  try {
    mkdirSync(join(dir, "factory"), { recursive: true });
    const rows = [];
    for (let i = 1; i <= 20; i++) {
      rows.push({ at: "2026-09-" + String(i).padStart(2, "0"), event: "row " + i });
    }
    writeFileSync(
      join(dir, "factory/board.json"),
      JSON.stringify({ now: "n", remote: "r", ledger: rows }, null, 2) + NL,
    );
    writeFileSync(
      join(dir, "factory/budgets.json"),
      JSON.stringify({ files: [], context: { ledgerRows: 5 } }, null, 2) + NL,
    );

    if (!checkErrors(dir).some((e) => /live ledger has 20 rows/.test(e))) {
      errors.push("an over-window ledger did not fail the check");
    }

    const first = rotate(dir);
    if (first.moved !== 15 || first.kept !== 5) {
      errors.push("rotate moved " + first.moved + " kept " + first.kept);
    }
    if (checkErrors(dir).length) errors.push("rotate did not clear the check");

    const after = JSON.parse(readFileSync(join(dir, "factory/board.json"), "utf8"));
    if (after.ledger.length !== 5 || after.ledger[4].event !== "row 20") {
      errors.push("rotate kept the wrong window");
    }
    const archived = readFileSync(join(dir, ARCHIVE_DIR + "/2026-09.md"), "utf8");
    for (let i = 1; i <= 15; i++) {
      if (!archived.includes("row " + i + NL) && !archived.includes("row " + i + " ")) {
        if (!archived.includes(" row " + i)) errors.push("archive lost row " + i);
      }
    }
    const again = rotate(dir);
    if (again.moved !== 0) errors.push("rotate is not idempotent");

    // A newer row in the archive means a rotation ran against a stale board.
    writeFileSync(
      join(dir, ARCHIVE_DIR + "/2026-09.md"),
      archived + "- 2026-12-01 a row from the future" + NL,
    );
    if (!checkErrors(dir).some((e) => /newer than the live window/.test(e))) {
      errors.push("a newer archived row did not fail the check");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  for (const e of checkErrors(kitRoot)) errors.push("live: " + e);

  if (errors.length) {
    console.error("ledger self-test failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("ledger self-test ok");
  process.exit(0);
}

const cmd = process.argv[2] || "--check";

if (cmd === "--self-test") selfTest();

if (cmd === "rotate") {
  const r = rotate(kitRoot);
  console.log("moved " + r.moved + "  kept " + r.kept);
  for (const f of r.files) console.log("  " + f);
  if (r.moved) {
    const render = spawnSync(process.execPath, [join(kitRoot, "factory/tools/renderBoard.mjs")], {
      cwd: kitRoot,
      encoding: "utf8",
    });
    process.stdout.write(render.stdout || "");
    process.stderr.write(render.stderr || "");
    process.exit(render.status === null ? 1 : render.status);
  }
  process.exit(0);
}

if (cmd === "--check") {
  const errors = checkErrors(kitRoot);
  if (errors.length) {
    console.error("ledger check failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("ledger check ok");
  process.exit(0);
}

console.error("usage: node factory/tools/ledger.mjs --check | rotate | --self-test");
process.exit(1);
