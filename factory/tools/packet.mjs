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
// Why: a lane that changed one line of YAML was billed 195138 input
// tokens because the seat browsed the repository instead of reading a
// packet. The ledger, the landed lanes and the archived history are
// memory; git holds them. They are not the reading path.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);

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

// traps.yaml without the comment lines and the blank lines between rows.
export function trapsDigest(text) {
  const rows = [];
  let cur = null;
  for (const raw of text.split(NL)) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const id = /^- id:\s*(\S+)/.exec(line);
    if (id) {
      if (cur) rows.push(cur);
      cur = { id: id[1], title: "", rule: "" };
      continue;
    }
    if (!cur) continue;
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
  const out = ["# Traps — paid for once. Read once.", ""];
  for (const r of rows) out.push(r.id + " " + r.title + ": " + r.rule);
  out.push("");
  return out.join(NL);
}

function envelopes(root) {
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

function selfTest() {
  const errors = [];
  const board = json(kitRoot, "factory/board.json");
  const slice = boardSlice(board);
  if (board.ledger && board.ledger.length) {
    const first = String(board.ledger[0].event || "").slice(0, 24);
    if (first && slice.includes(first)) errors.push("board slice leaked a ledger row");
  }
  const landed = (board.lanes || []).find((l) => l.state === "landed");
  if (landed && slice.includes(landed.title)) errors.push("board slice leaked a landed lane");
  if (!slice.includes(String(board.now).slice(0, 20))) errors.push("board slice lost Now");

  const digest = trapsDigest(read(kitRoot, "factory/traps.yaml"));
  const trapIds = (read(kitRoot, "factory/traps.yaml").match(/^- id: \S+/gm) || []).length;
  const digestIds = (digest.match(/^T\d+ /gm) || []).length;
  if (trapIds !== digestIds) errors.push("traps digest dropped rows: " + trapIds + " to " + digestIds);
  if (digest.length >= read(kitRoot, "factory/traps.yaml").length) {
    errors.push("traps digest is not smaller than traps.yaml");
  }

  const seat = seatPacket(kitRoot, null);
  if (seat.some((p) => p.bytes === 0)) errors.push("a packet part is empty");
  if (total(seat) >= wholeFiles(kitRoot)) errors.push("the packet is not smaller than reading the files whole");

  const missing = seatPacket(kitRoot, "F-does-not-exist");
  if (!render(missing).includes("MISSING")) errors.push("an unissued lane must be named MISSING, not silent");

  // The envelope changes every lane; it is the last part so that the bytes
  // before it are identical for every lane of a sitting. That is the span a
  // provider prefix cache can hit (T45). One lane is issued and one is not, so
  // a MISSING part is covered too — it is still the envelope part, still last.
  const issued = envelopes(kitRoot).map((f) => f.replace(/\.md$/, ""));
  const laneA = issued[0] || "F-lane-a-not-issued";
  const laneB = laneA === "F-lane-b-not-issued" ? "F-lane-c-not-issued" : "F-lane-b-not-issued";
  const packets = [seatPacket(kitRoot, laneA), seatPacket(kitRoot, laneB)];
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

  for (const e of checkErrors(kitRoot)) errors.push("live: " + e);

  if (errors.length) {
    console.error("packet self-test failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("packet self-test ok");
  process.exit(0);
}

const cmd = process.argv[2] || "cost";

if (cmd === "--self-test") selfTest();

if (cmd === "--check") {
  const errors = checkErrors(kitRoot);
  if (errors.length) {
    console.error("packet check failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("packet check ok");
  process.exit(0);
}

if (cmd === "cost") {
  cost(kitRoot);
  process.exit(0);
}

if (cmd === "seat" || cmd === "cp") {
  const lane = process.argv[3] || "";
  const parts = cmd === "seat" ? seatPacket(kitRoot, lane) : cpPacket(kitRoot, lane);
  process.stdout.write(render(parts));
  // stdout is the packet. The meter goes to stderr so a pipe stays clean.
  process.stderr.write(
    "packet " + cmd + (lane ? " " + lane : "") + "  " + kb(total(parts)) + NL,
  );
  process.exit(0);
}

console.error("usage: node factory/tools/packet.mjs seat <LANE> | cp [LANE] | cost | --check | --self-test");
process.exit(1);
