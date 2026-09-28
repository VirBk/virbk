#!/usr/bin/env node
// Round-card CLI. Decides the next role. Does not call a model, read a key,
// push, or land. Launch stays factory/tools/seat.mjs. Landing stays the
// control plane.
//
//   node factory/orchestrator.mjs status <card.json>
//   node factory/orchestrator.mjs next   <card.json>
//   node factory/orchestrator.mjs check  <card.json>
//   node factory/orchestrator.mjs advance <card.json> <event>
//   node factory/orchestrator.mjs --self-test

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capFor, challengeRequired, check, decide, advance } from "./lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EVENTS = [
  "writer_returned",
  "review_approved",
  "review_changes",
  "correction_returned",
  "challenge_returned",
  "landed",
];

function load(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function save(path, card) {
  writeFileSync(resolve(path), JSON.stringify(card, null, 2) + "\n");
}

function fail(errors) {
  console.error("FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

function requireClean(card) {
  const errors = check(card);
  if (errors.length) fail(errors);
}

function promptExists(decision) {
  if (!decision.prompt_file) return;
  const abs = join(root, decision.prompt_file);
  if (!existsSync(abs)) fail(["missing prompt " + decision.prompt_file]);
}

function selfTest() {
  const test = join(dirname(fileURLToPath(import.meta.url)), "orchestrator.test.mjs");
  const run = spawnSync(process.execPath, ["--test", test], { stdio: "inherit" });
  process.exit(run.status === null ? 1 : run.status);
}

const [, , cmd, cardPath, event] = process.argv;

if (cmd === "--self-test") selfTest();

if (!cmd || !cardPath || cmd === "--help") {
  console.error("usage: orchestrator.mjs <status|next|check|advance> <card.json> [event]");
  process.exit(2);
}

let card;
try {
  card = load(cardPath);
} catch (err) {
  console.error("FAIL");
  console.error("  - " + (err && err.message ? err.message : String(err)));
  process.exit(1);
}

if (cmd === "check") {
  const errors = check(card);
  if (errors.length) fail(errors);
  console.log("OK");
  process.exit(0);
}

if (cmd === "status" || cmd === "next") {
  requireClean(card);
  const decision = decide(card);
  promptExists(decision);
  if (cmd === "status") {
    console.log(JSON.stringify({
      lane: card.lane,
      tier: card.tier,
      state: card.state,
      correctionsUsed: card.correctionsUsed,
      correctionCap: capFor(card),
      challengeRequired: challengeRequired(card),
      next: decision,
    }, null, 2));
  } else {
    console.log(JSON.stringify(decision, null, 2));
  }
  process.exit(0);
}

if (cmd === "advance") {
  if (!EVENTS.includes(event)) {
    console.error("usage: orchestrator.mjs advance <card.json> <" + EVENTS.join("|") + ">");
    process.exit(2);
  }
  requireClean(card);
  let next;
  try {
    next = advance(card, event);
  } catch (err) {
    fail([err.message]);
  }
  const errors = check(next);
  if (errors.length) fail(errors);
  const decision = decide(next);
  promptExists(decision);
  save(cardPath, next);
  console.log(JSON.stringify({ state: next.state, next: decision }, null, 2));
  process.exit(0);
}

console.error("unknown command: " + cmd);
process.exit(2);
