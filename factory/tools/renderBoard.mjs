#!/usr/bin/env node
// BOARD.md is generated from factory/board.json. --check fails if the
// committed BOARD.md is not what this script would write.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const board = JSON.parse(readFileSync(join(root, "factory/board.json"), "utf8"));

function row(cells) {
  return "| " + cells.join(" | ") + " |";
}

const lines = [
  "# BOARD",
  "",
  "Generated from `factory/board.json`. Do not hand-edit this file. Restamp with `node factory/tools/renderBoard.mjs`.",
  "",
  "## Now",
  "",
  board.now,
  "",
  `Remote: ${board.remote}. References: ${(board.references || []).join(", ")}.`,
  "",
  "## Gates",
  "",
  row(["ID", "State", "Title"]),
  row(["---", "---", "---"]),
  ...board.gates.map((g) => row([g.id, g.open ? "open" : "closed", g.title])),
  "",
  "No envelope opens a gate.",
  "",
  "## Lanes",
  "",
  row(["ID", "State", "Hold", "Title"]),
  row(["---", "---", "---", "---"]),
  ...board.lanes.map((l) => row([l.id, l.state, l.hold, l.title])),
  "",
  "## Holds",
  "",
  ...board.holds.map((h) => `- ${h.name} — ${h.holder}`),
  "",
  "## Keystones",
  "",
  board.keystones.length
    ? board.keystones.map((k) => `- ${k}`).join("\n")
    : "Closed list, empty until the product is named.",
  "",
  "## Shelf",
  "",
  ...board.shelf.map((s) => `- ${s.item} — trigger: ${s.trigger}`),
  "",
  "## Ledger",
  "",
  "Live window. Older rows are in `docs/ledger/`, which is history, not the reading path.",
  "",
  ...board.ledger.map((e) => `- ${e.at} ${e.event}`),
  "",
];

const next = lines.join("\n");
const out = join(root, "BOARD.md");
const check = process.argv.includes("--check");

if (check) {
  const current = readFileSync(out, "utf8");
  if (current !== next) {
    console.error("BOARD.md is not the render of factory/board.json");
    process.exit(1);
  }
  console.log("BOARD.md matches factory/board.json");
  process.exit(0);
}

writeFileSync(out, next);
console.log("wrote BOARD.md");
