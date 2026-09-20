#!/usr/bin/env node
// The packet is the reading path, measured. A seat reads these bytes and
// no others. Static bytes first so a provider prefix cache hits (T45);
// the envelope, which changes every lane, goes last.
//
//   node factory/tools/packet.mjs seat F22        > packet.txt
//   node factory/tools/packet.mjs seat F22 | qwen --auth-type openai -p -
//   node factory/tools/packet.mjs cp
//   node factory/tools/packet.mjs cost
//   node factory/tools/packet.mjs --check
//   node factory/tools/packet.mjs --self-test
//
// The gate runs two steps from this file, and they are deliberately two
// sizes of claim. `--self-test` asserts the packet's shape: the board slice
// leaks no history, the traps digest loses no row, the envelope is last, the
// bytes before it are the same for every lane. `--check` measures the live
// tree against the caps in factory/budgets.json. Both used to be one step,
// and X01 was reverted because a single step carrying a dozen unrelated
// assertions cannot be suspended more narrowly than its own hypothesis (T66).
//
// Either command takes `--root <tree>`, which points it at a tree other than
// this one; that is how a fixture tree drives a proof. The flag is parsed out
// before the command is dispatched, so either order works: a caller that gets
// the usage branch instead of a verdict cannot tell a typo from a failure.
//
// Why: a lane that changed one line of YAML was billed 195138 input
// tokens because the seat browsed the repository instead of reading a
// packet. The ledger, the landed lanes and the archived history are
// memory; git holds them. They are not the reading path.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);

// The gate's second packet step. kitCheck rule G is satisfied by the
// --self-test step alone, so nothing else in the kit would notice if this step
// were deleted from the gate; the claim is asserted here instead, from the
// file that owns it (T04), and the self-test proves the assertion can fail.
const PACKET_CHECK_STEP = "node factory/tools/packet.mjs --check";

// The CLI runs only when this file is the process entry point. sizeBudget.mjs
// imports the measurements below, and a dispatch that ran on import would end
// that process — a gate step that cannot fail (T14). The test is on the entry
// name, so a mis-detection in the safe direction is impossible: node sets
// argv[1] to the file it was told to run.
const isEntry = /packet\.mjs$/.test(process.argv[1] || "");

// `--root <tree>` is a property of the invocation, not of one command, so it
// is stripped before anything is dispatched. Leaving it in argv made
// `--root X --check` dispatch on the string "--root" and print usage with
// exit 1 — the same exit code a failed check gives (D-54 lane F33).
function parseArgs(argv) {
  const rest = [];
  let root = kitRoot;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1]) {
      root = resolve(argv[i + 1]);
      i++;
      continue;
    }
    rest.push(argv[i]);
  }
  return { root, rest };
}

function read(root, rel) {
  return readFileSync(join(root, rel), "utf8");
}

function json(root, rel) {
  return JSON.parse(read(root, rel));
}

function budgets(root) {
  const b = json(root, "factory/budgets.json");
  return {
    seatPacketKb: 26,
    cpPacketKb: 44,
    envelopeKb: 6,
    ...(b.context || {}),
  };
}

// The live board: what is true now. Not what happened.
export function boardSlice(board) {
  const open = (board.lanes || []).filter((l) => l.state !== "landed" && l.state !== "dropped");
  const lines = [
    "# BOARD (live slice)",
    "",
    "Generated from factory/board.json by factory/tools/packet.mjs.",
    "Landed lanes and the ledger are history: they live in git, not in the reading path.",
    "",
    "## Now",
    "",
    String(board.now || ""),
    "",
    "Remote: " + board.remote + ". References: " + (board.references || []).join(", ") + ".",
    "",
    "## Gates",
    "",
  ];
  for (const g of board.gates || []) {
    lines.push("- " + g.id + " " + (g.open ? "open" : "closed") + " — " + g.title);
  }
  lines.push("", "No envelope opens a gate.", "", "## Open lanes", "");
  if (open.length) {
    for (const l of open) {
      lines.push("- " + l.id + " " + l.state + " — " + l.title + " — hold: " + l.hold);
    }
  } else {
    lines.push("None. Idle is success.");
  }
  lines.push("", "## Single-writer holds", "");
  for (const h of board.holds || []) lines.push("- " + h.name + " — " + h.holder);
  lines.push("", "## Keystones", "");
  for (const k of board.keystones || []) lines.push("- " + k);
  lines.push("", "## Shelf", "");
  for (const s of board.shelf || []) lines.push("- " + s.item + " — trigger: " + s.trigger);
  lines.push("");
  return lines.join(NL);
}

// The one parser for traps.yaml. The digest, the object resolver and the
// self-test all read a row through this, so no two of them can disagree about
// what the file says (T04). `object` sits between `kind` and `title`, so it is
// parsed here rather than being swallowed into the rule as a continuation line.
export function parseTraps(text) {
  const rows = [];
  let cur = null;
  for (const raw of text.split(NL)) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const id = /^- id:\s*(\S+)/.exec(line);
    if (id) {
      if (cur) rows.push(cur);
      cur = { id: id[1], object: "", title: "", rule: "" };
      continue;
    }
    if (!cur) continue;
    const object = /^\s+object:\s*(.+)$/.exec(line);
    if (object) {
      // A bare `*` would be a YAML alias, so the file may quote it.
      cur.object = object[1].trim().replace(/^["']|["']$/g, "");
      continue;
    }
    const title = /^\s+title:\s*(.+)$/.exec(line);
    if (title) {
      cur.title = title[1];
      continue;
    }
    const rule = /^\s+rule:\s*(.+)$/.exec(line);
    if (rule) {
      cur.rule = rule[1];
      continue;
    }
    if (/^\s+\S/.test(line) && cur.rule) cur.rule += " " + line.trim();
  }
  if (cur) rows.push(cur);
  return rows;
}

// Whether a rule carries a sentence that begins "Check is " — the mark that a
// landing step already enforces the trap. The sentence has to start after a
// period and a space, or open the rule, so the words inside a longer clause do
// not count.
export function ruleNamesACheck(rule) {
  return /(^|\.\s)Check is /.test(rule);
}

// The first sentence of a rule: up to and including its first period that ends
// a sentence. A decimal point (0.5) has no space after it, so it does not split.
function firstSentence(text) {
  const m = /^[\s\S]*?\.(?=\s|$)/.exec(text);
  return m ? m[0] : text;
}

// traps.yaml without the comment lines and the blank lines between rows, and
// without the prose of a trap the gate already enforces: a trap whose rule
// names a check rides in the packet as its id, its title and its first
// sentence only, so writing a check removes the rest from every future packet
// (D-52 remedy two). Every row still emits, so the digest count still equals
// the trap count, and `object` never reaches the packet.
export function trapsDigest(text) {
  const out = ["# Traps — paid for once. Read once.", ""];
  for (const r of parseTraps(text)) {
    const rule = ruleNamesACheck(r.rule) ? firstSentence(r.rule) : r.rule;
    out.push(r.id + " " + r.title + ": " + rule);
  }
  out.push("");
  return out.join(NL);
}

function globSegmentToRegExp(segment) {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.split("*").join("[^/]*").split("?").join("[^/]") + "$");
}

// An object resolves when the tree holds what it names: `*` binds everywhere,
// an exact path exists, or a glob matches at least one file. The tree is the
// one the packet is measured against, so a fixture drives this too.
export function objectResolves(root, object) {
  if (object === "*") return true;
  const segments = object.split("/").filter((s) => s !== "");
  const walk = (dir, i) => {
    if (i === segments.length) return existsSync(dir);
    const segment = segments[i];
    if (!/[*?]/.test(segment)) {
      const next = join(dir, segment);
      return existsSync(next) && walk(next, i + 1);
    }
    if (!existsSync(dir)) return false;
    const re = globSegmentToRegExp(segment);
    return readdirSync(dir).some((name) => re.test(name) && walk(join(dir, name), i + 1));
  };
  return walk(root, 0);
}

// Issued envelopes: one per lane the control plane has launched, README out.
export function envelopes(root) {
  const dir = join(root, "factory/envelopes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^[A-Za-z]\w*\.md$/.test(f) && f !== "README.md")
    .sort();
}

function part(name, body) {
  return { name, body, bytes: Buffer.byteLength(body, "utf8") };
}

export function seatPacket(root, lane) {
  const parts = [
    part("AGENTS.md", read(root, "AGENTS.md")),
    part("BOARD (live slice)", boardSlice(json(root, "factory/board.json"))),
    part("traps digest", trapsDigest(read(root, "factory/traps.yaml"))),
  ];
  const file = lane ? join(root, "factory/envelopes", lane + ".md") : "";
  if (lane && existsSync(file)) {
    parts.push(part("envelope " + lane, readFileSync(file, "utf8")));
  } else if (lane) {
    parts.push(part("envelope " + lane, "MISSING: factory/envelopes/" + lane + ".md was not issued." + NL));
  }
  return parts;
}

export function cpPacket(root, lane) {
  const parts = seatPacket(root, null);
  parts.splice(3, 0, part("factory/CONTROL_PLANE.md", read(root, "factory/CONTROL_PLANE.md")));
  parts.splice(4, 0, part("factory/sparks.json (look, not law)", read(root, "factory/sparks.json")));
  if (lane) {
    const file = join(root, "factory/envelopes", lane + ".md");
    if (existsSync(file)) parts.push(part("envelope " + lane, readFileSync(file, "utf8")));
  }
  return parts;
}

function render(parts) {
  const out = [];
  for (const p of parts) {
    out.push("===== " + p.name + " =====");
    out.push(p.body.endsWith(NL) ? p.body.slice(0, -1) : p.body);
    out.push("");
  }
  return out.join(NL);
}

// Everything rendered before the envelope part. Those are the bytes every
// lane of a sitting shares, so they are the span a prefix cache can hit (T45).
// Null when there is no envelope part at all.
function prefixBytes(parts) {
  const i = parts.findIndex((p) => p.name.startsWith("envelope "));
  return i < 0 ? null : render(parts.slice(0, i));
}

function total(parts) {
  return parts.reduce((n, p) => n + p.bytes, 0);
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

function wholeFiles(root) {
  // What a seat reads when nothing bounds it: the three named files whole.
  let n = 0;
  for (const rel of ["AGENTS.md", "BOARD.md", "factory/traps.yaml"]) {
    if (existsSync(join(root, rel))) n += statSync(join(root, rel)).size;
  }
  return n;
}

function cost(root) {
  const seat = seatPacket(root, null);
  const cp = cpPacket(root, null);
  const whole = wholeFiles(root);
  const packed = total(seat);
  console.log("reading path" + NL);
  for (const p of seat) console.log("  " + kb(p.bytes).padStart(9) + "  " + p.name);
  console.log("  " + kb(packed).padStart(9) + "  seat packet, no envelope");
  console.log("  " + kb(total(cp)).padStart(9) + "  control-plane packet");
  console.log("");
  console.log("  " + kb(whole).padStart(9) + "  AGENTS.md + BOARD.md + traps.yaml read whole");
  console.log(
    "  " +
      String(Math.round((1 - packed / whole) * 100)).padStart(6) +
      " %  cut by the packet, before the envelope",
  );
  console.log("");
  const live = envelopes(root);
  if (!live.length) {
    console.log("  no envelope issued — idle is success");
    return;
  }
  for (const f of live) {
    const bytes = statSync(join(root, "factory/envelopes", f)).size;
    console.log("  " + kb(bytes).padStart(9) + "  factory/envelopes/" + f);
  }
}

export function checkErrors(root) {
  const errors = [];
  const caps = budgets(root);
  const seat = total(seatPacket(root, null));
  const cp = total(cpPacket(root, null));
  if (seat > caps.seatPacketKb * 1024) {
    errors.push("seat packet " + kb(seat) + " over " + caps.seatPacketKb + " KB");
  }
  if (cp > caps.cpPacketKb * 1024) {
    errors.push("control-plane packet " + kb(cp) + " over " + caps.cpPacketKb + " KB");
  }
  for (const f of envelopes(root)) {
    const bytes = statSync(join(root, "factory/envelopes", f)).size;
    if (bytes > caps.envelopeKb * 1024) {
      errors.push("envelope " + f + " " + kb(bytes) + " over " + caps.envelopeKb + " KB — an envelope is one page");
    }
  }
  // The packet is the reading path only if the law points at it.
  const agents = read(root, "AGENTS.md");
  if (!agents.includes("factory/tools/packet.mjs")) {
    errors.push("AGENTS.md does not name factory/tools/packet.mjs");
  }
  return errors;
}

// The gate has to hold a step that runs the budget claim, or the two claims
// collapse back into one. This reads factory/landing-checks.json in the tree
// being tested, in the same act as the check (T04).
export function landingStepErrors(root) {
  const rel = "factory/landing-checks.json";
  if (!existsSync(join(root, rel))) return [rel + " is not in the tree"];
  let steps = [];
  try {
    steps = JSON.parse(read(root, rel)).steps || [];
  } catch (err) {
    return [rel + " does not parse: " + String(err.message || err).split(NL)[0]];
  }
  if (steps.some((s) => String(s.run || "").trim() === PACKET_CHECK_STEP)) return [];
  return [
    rel +
      " names no step whose run is `" +
      PACKET_CHECK_STEP +
      "` — rule G is satisfied by the --self-test step alone, so this hole reopens silently",
  ];
}

// A tree this test wrote, so the two assertions about `--root` are about the
// dispatch and not about this repository's own numbers drifting. It is over its
// own seat-packet cap on purpose: this repository's `--check` passes, so a tree
// that passed too would let a run that parsed `--root` and threw its value away
// print the live verdict and satisfy both assertions (T13).
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "grok-packet-"));
  mkdirSync(join(dir, "factory/envelopes"), { recursive: true });
  writeFileSync(
    join(dir, "AGENTS.md"),
    "# AGENTS.md" +
      NL +
      "The reading path is factory/tools/packet.mjs." +
      NL +
      NL +
      "Filler, so the seat packet is over the cap below. ".repeat(40) +
      NL,
  );
  writeFileSync(
    join(dir, "factory/board.json"),
    JSON.stringify({
      now: "a fixture board",
      remote: "none",
      references: [],
      gates: [],
      lanes: [],
      holds: [],
      keystones: [],
      shelf: [],
    }) + NL,
  );
  writeFileSync(
    join(dir, "factory/traps.yaml"),
    "- id: T01" + NL + "  title: fixture" + NL + "  rule: a fixture rule." + NL,
  );
  writeFileSync(join(dir, "factory/CONTROL_PLANE.md"), "# Control plane" + NL);
  writeFileSync(
    join(dir, "factory/sparks.json"),
    JSON.stringify({ sitting: 0, note: "look, not law", items: [] }) + NL,
  );
  writeFileSync(join(dir, "factory/envelopes/F00.md"), "e".repeat(200));
  writeFileSync(
    join(dir, "factory/budgets.json"),
    JSON.stringify({
      files: [],
      globs: [],
      context: { seatPacketKb: 1, cpPacketKb: 100, envelopeKb: 1 },
    }) + NL,
  );
  writeFileSync(
    join(dir, "factory/landing-checks.json"),
    JSON.stringify({ steps: [{ name: "Reading path under its context budget", run: PACKET_CHECK_STEP }] }) + NL,
  );
  return dir;
}

// The shape of the packet, and nothing about its size. A tree over its caps
// fails --check and passes this; a packet whose envelope is not last fails
// this and passes --check. Two claims, two steps, so an experiment can
// suspend one of them (T66).
function selfTest(root) {
  const errors = [];
  const board = json(root, "factory/board.json");
  const slice = boardSlice(board);
  if (board.ledger && board.ledger.length) {
    const first = String(board.ledger[0].event || "").slice(0, 24);
    if (first && slice.includes(first)) errors.push("board slice leaked a ledger row");
  }
  const landed = (board.lanes || []).find((l) => l.state === "landed");
  if (landed && slice.includes(landed.title)) errors.push("board slice leaked a landed lane");
  if (!slice.includes(String(board.now).slice(0, 20))) errors.push("board slice lost Now");

  const trapText = read(root, "factory/traps.yaml");
  const traps = parseTraps(trapText);
  const digest = trapsDigest(trapText);
  const digestIds = (digest.match(/^T\d+ /gm) || []).length;
  if (traps.length !== digestIds) {
    errors.push("traps digest dropped rows: " + traps.length + " to " + digestIds);
  }
  if (digest.length >= trapText.length) errors.push("traps digest is not smaller than traps.yaml");

  // Every trap is addressable: it names the artifact it binds to, or the mark
  // that says it binds everywhere. A trap with no object is a trap no scope can
  // ever find, and an object pointing at a file that is not there is the shape
  // this claim exists to stop. Read from the same text as the digest above.
  for (const t of traps) {
    if (!t.object) errors.push("trap " + t.id + " has no object");
    else if (t.object !== "*" && !objectResolves(root, t.object)) {
      errors.push("trap " + t.id + " object does not resolve: " + t.object);
    }
  }

  // A trap whose rule already names a check is enforced by the landing gate, so
  // the packet carries its id, its title and its first sentence and not the
  // rest of the prose (D-52 remedy two). Reverting the compression fails here;
  // a tree where no rule names a check would make the assertion vacuous, so
  // that fails too.
  const checked = traps.filter((t) => ruleNamesACheck(t.rule));
  if (!checked.length) errors.push("no trap rule names a check — the digest compression is untested");
  for (const t of checked) {
    const want = t.id + " " + t.title + ": " + firstSentence(t.rule);
    const got = digest.split(NL).find((l) => l.startsWith(t.id + " "));
    if (got !== want) errors.push("digest did not compress " + t.id + ": " + JSON.stringify(got));
  }

  const seat = seatPacket(root, null);
  if (seat.some((p) => p.bytes === 0)) errors.push("a packet part is empty");
  if (total(seat) >= wholeFiles(root)) errors.push("the packet is not smaller than reading the files whole");

  const missing = seatPacket(root, "F-does-not-exist");
  if (!render(missing).includes("MISSING")) errors.push("an unissued lane must be named MISSING, not silent");

  // The envelope changes every lane; it is the last part so that the bytes
  // before it are identical for every lane of a sitting. That is the span a
  // provider prefix cache can hit (T45). One lane is issued and one is not, so
  // a MISSING part is covered too — it is still the envelope part, still last.
  const issued = envelopes(root).map((f) => f.replace(/\.md$/, ""));
  const laneA = issued[0] || "F-lane-a-not-issued";
  const laneB = laneA === "F-lane-b-not-issued" ? "F-lane-c-not-issued" : "F-lane-b-not-issued";
  const packets = [seatPacket(root, laneA), seatPacket(root, laneB)];
  packets.forEach((parts, i) => {
    const last = parts[parts.length - 1];
    if (!last || !last.name.startsWith("envelope ")) {
      errors.push(
        "seatPacket: the envelope part is not last for " +
          (i === 0 ? laneA : laneB) +
          " — static bytes and the cached prefix are broken up",
      );
    }
  });
  const preA = prefixBytes(packets[0]);
  const preB = prefixBytes(packets[1]);
  if (!preA || !preB) {
    errors.push("seatPacket: a lane produced no bytes before the envelope part");
  } else if (!preA.includes("===== AGENTS.md =====")) {
    errors.push("seatPacket: the bytes before the envelope part are empty — the envelope is not last");
  } else if (preA !== preB) {
    errors.push(
      "seatPacket: the bytes before the envelope part differ between " + laneA + " and " + laneB,
    );
  }

  // The gate must hold a step that runs the budget claim, and the fixture below
  // must be able to fail that. Without the second half the claim would pass on
  // an empty file, which is exactly how the hole reopens.
  for (const e of landingStepErrors(root)) errors.push(e);

  const dir = fixture();
  try {
    const cli = fileURLToPath(import.meta.url);
    // `--root <tree>` before and after the command, both against a tree this
    // test wrote. That tree is over its seat-packet cap, so the verdict has to
    // be this tree's and not this repository's: a run that parsed `--root` and
    // threw the value away reads the kit, which passes, prints `packet check
    // ok`, and fails here. The status and the message are the fixture's own cap.
    for (const args of [
      ["--root", dir, "--check"],
      ["--check", "--root", dir],
    ]) {
      const r = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
      const out = (r.stdout || "") + (r.stderr || "");
      if (r.status === 0 || !out.includes("packet check failed") || !out.includes("over 1 KB")) {
        errors.push(
          args.join(" ") +
            " did not measure the tree it was pointed at: exit " +
            r.status +
            " " +
            out.trim().split(NL).join(" / "),
        );
      }
    }

    // The same tree with that one step removed must fail the claim above.
    const cut = JSON.parse(read(dir, "factory/landing-checks.json")).steps || [];
    writeFileSync(
      join(dir, "factory/landing-checks.json"),
      JSON.stringify({ steps: cut.filter((s) => String(s.run || "").trim() !== PACKET_CHECK_STEP) }) + NL,
    );
    if (!landingStepErrors(dir).length) {
      errors.push("the landing-step claim passes with the --check step removed — it cannot fail");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (errors.length) {
    console.error("packet self-test failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("packet self-test ok — shape only");
  process.exit(0);
}

if (isEntry) {
  const { root, rest } = parseArgs(process.argv.slice(2));
  const cmd = rest[0] || "cost";

  if (cmd === "--self-test") selfTest(root);

  if (cmd === "--check") {
    const errors = checkErrors(root);
    if (errors.length) {
      console.error("packet check failed");
      for (const e of errors) console.error("  " + e);
      process.exit(1);
    }
    console.log("packet check ok");
    process.exit(0);
  }

  if (cmd === "cost") {
    cost(root);
    process.exit(0);
  }

  if (cmd === "seat" || cmd === "cp") {
    const lane = rest[1] || "";
    const parts = cmd === "seat" ? seatPacket(root, lane) : cpPacket(root, lane);
    process.stdout.write(render(parts));
    // stdout is the packet. The meter goes to stderr so a pipe stays clean.
    process.stderr.write(
      "packet " + cmd + (lane ? " " + lane : "") + "  " + kb(total(parts)) + NL,
    );
    process.exit(0);
  }

  console.error(
    "usage: node factory/tools/packet.mjs seat <LANE> | cp [LANE] | cost | --check | --self-test [--root <tree>]",
  );
  process.exit(1);
}
