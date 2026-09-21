#!/usr/bin/env node
// Two claims about size, and they are not the same claim. A budget is a
// ceiling: a file over it fails the landing. A band is 80 per cent of a
// ceiling: it names work AGENTS.md section 4 already authorizes — archive at
// 80 per cent — and fails nothing. A band that created authority to mutate a
// file would be a second ceiling in a schedule's clothes (D-54).
//
//   node factory/tools/sizeBudget.mjs
//   node factory/tools/sizeBudget.mjs --root <tree>
//   node factory/tools/sizeBudget.mjs --self-test
//
// Caps come from factory/budgets.json in the tree being measured. Lane logs
// are globbed; a missing file is not a failure. The three context budgets —
// the prefix every seat shares, the control-plane packet, an envelope — are
// measured through packet.mjs, so this step and the packet steps cannot
// disagree about the same number.
//
// Two context reports, and they are not the same number (S21). The band is the
// PREFIX: the byte-stable bytes every seat of a sitting shares, budgeted at
// seatPacketKb and measuring exactly what it always measured. A seat's packet
// is that prefix PLUS its own envelope, and the total is what a control plane
// must read before it issues, so `seat totals` reports it per issued lane
// against seatPacketKb + envelopeKb. The band used to be labelled the seat
// packet while measuring only the prefix, so a control plane reading the green
// one could hand a seat seatPacketKb + envelopeKb of context believing it had
// checked it. The caps are not moved here; only the measurement is made honest.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpPacket, envelopes, seatPacket } from "./packet.mjs";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const BAND = 80; // per cent of a cap

function rootFrom(argv) {
  const i = argv.indexOf("--root");
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : kitRoot;
}

function sizeOf(full) {
  return statSync(full).size;
}

function total(parts) {
  return parts.reduce((n, p) => n + p.bytes, 0);
}

// factory/budgets.json, with every cap normalized once. A cap that is not a
// number is a missing cap, not a smaller one: `"10" * 1024` coerces in banded()
// and pct() while Number.isFinite refuses it in the report, so one run would
// band a row at 10 KB and print `n/a` for it — one run, two answers. Normalize
// at the read, in one place, so the two reports below and the packet steps
// cannot disagree about what the file says.
export function readBudgets(root) {
  const budgets = JSON.parse(readFileSync(join(root, "factory/budgets.json"), "utf8"));
  const capOf = (v) => (Number.isFinite(v) ? v : undefined);
  for (const f of budgets.files || []) f.capKb = capOf(f.capKb);
  for (const g of budgets.globs || []) g.capKb = capOf(g.capKb);
  for (const k of ["seatPacketKb", "cpPacketKb", "envelopeKb"]) {
    if (budgets.context) budgets.context[k] = capOf(budgets.context[k]);
  }
  return budgets;
}

// Every file a budget names, every match of a glob a budget names, and the
// three budgets that are not files at all. The envelope row is the largest
// envelope issued, which is the binding one. Each row names its `kind`, so a
// reader locates the prefix or the control-plane packet by what it IS and not
// by the text of a label that has to change.
export function measures(root) {
  const budgets = readBudgets(root);
  const rows = [];
  for (const file of budgets.files || []) {
    const full = join(root, file.path);
    if (existsSync(full)) rows.push({ kind: "file", label: file.path, bytes: sizeOf(full), capKb: file.capKb });
  }
  for (const glob of budgets.globs || []) {
    const m = /^(.*)\/\*\.md$/.exec(glob.pattern);
    if (!m) continue;
    const dir = join(root, m[1]);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const full = join(dir, name);
      // A label is a path in this repository, so it is spelled the way git
      // spells it, on every host.
      rows.push({
        kind: "glob",
        label: relative(root, full).replace(/\\/g, "/"),
        bytes: sizeOf(full),
        capKb: glob.capKb,
      });
    }
  }
  const context = budgets.context || {};
  const issued = envelopes(root);
  const largest = issued.reduce((n, f) => Math.max(n, sizeOf(join(root, "factory/envelopes", f))), 0);
  rows.push({
    kind: "envelope",
    label: issued.length ? "envelope (largest of " + issued.length + ")" : "envelope (none issued)",
    bytes: largest,
    capKb: context.envelopeKb,
  });
  // The prefix, and only the prefix: no lane, so no envelope. This is the band
  // the whole sitting shares, and it keeps the label it always had minus the
  // word "seat packet", which was the lie S21 is about.
  rows.push({
    kind: "prefix",
    label: "packet prefix (shared, no envelope)",
    bytes: total(seatPacket(root, null)),
    capKb: context.seatPacketKb,
  });
  rows.push({
    kind: "cp",
    label: "control-plane packet",
    bytes: total(cpPacket(root, null)),
    capKb: context.cpPacketKb,
  });
  return rows;
}

// The second report: what a seat of an issued lane ACTUALLY receives, which is
// the prefix plus that lane's envelope. One row per envelope in the tree, so an
// envelope with no lane in it is still measured, and a lane whose total is over
// the combined cap is named. A row is a total, not a band: the ceiling is
// seatPacketKb + envelopeKb and passing it is a failure, so there is nothing to
// schedule at 80 per cent of it (D-54).
export function seatTotals(root) {
  const context = readBudgets(root).context || {};
  const caps =
    Number.isFinite(context.seatPacketKb) && Number.isFinite(context.envelopeKb)
      ? context.seatPacketKb + context.envelopeKb
      : undefined;
  return envelopes(root).map((file) => {
    const lane = file.replace(/\.md$/, "");
    return {
      kind: "lane",
      lane,
      label: "seat total " + lane + " (prefix + envelope)",
      bytes: total(seatPacket(root, lane)),
      capKb: caps,
    };
  });
}

function pct(row) {
  return (row.bytes * 100) / (row.capKb * 1024);
}

// A band is scheduled work, so it is a per-cent comparison in integers: the
// edge at exactly 80 per cent must not depend on a float's last bit. A seat
// total is not a band: over seatPacketKb + envelopeKb is a failure, so there is
// nothing under it to schedule (D-54), and a lane row that banded would put a
// second number under a schedule's name.
function banded(row) {
  return row.kind !== "lane" && row.bytes * 100 >= row.capKb * 1024 * BAND;
}

// Fail closed. A row whose cap is missing measures NaN and lands here, not in
// the silent column.
function overCap(row) {
  return !(row.bytes <= row.capKb * 1024);
}

// A row whose cap is missing is a defect in the file being measured, not a
// crash in the tool that measures it: overCap already routes it to the failure
// column, so this line has to print it. It used to call capKb.toFixed(1) on an
// undefined cap and throw before either half of that could happen — the run
// exited non-zero with a TypeError, which a caller reads as the message.
function capText(row) {
  return Number.isFinite(row.capKb) ? row.capKb.toFixed(1).padStart(6) + " KB" : "  no cap";
}

// One line per over-cap row, whichever report the row came from. A lane row
// carries its own lane in the label, so the failure names the lane and only it.
function overText(row) {
  const cap = Number.isFinite(row.capKb) ? row.capKb + " KB" : "no capKb in the file being measured";
  return "  " + row.label + " " + (row.bytes / 1024).toFixed(1) + " KB > " + cap;
}

function line(row) {
  const mark = banded(row) ? "BAND " : "     ";
  return (
    "  " +
    mark +
    (Number.isFinite(row.capKb) ? (pct(row).toFixed(1) + "%").padStart(7) : "    n/a") +
    "  " +
    (row.bytes / 1024).toFixed(1).padStart(8) +
    " / " +
    capText(row) +
    "  " +
    row.label
  );
}

function run(root) {
  const rows = measures(root);
  const totals = seatTotals(root);
  const over = rows.filter(overCap);
  const overTotals = totals.filter(overCap);
  const bands = rows.filter((r) => !overCap(r) && banded(r));
  console.log("size budget — " + rows.length + " budgets, bands at " + BAND + " per cent" + NL);
  for (const row of rows) console.log(line(row));
  console.log("");
  console.log("seat totals — prefix + envelope, caps from factory/budgets.json" + NL);
  if (totals.length) {
    for (const row of totals) console.log(line(row));
  } else {
    console.log(
      "  no envelope issued — nothing to measure; the prefix above is what every seat receives between landings",
    );
  }
  if (over.length) {
    console.error("");
    console.error("size budget failed:");
    for (const r of over) console.error(overText(r));
  }
  if (overTotals.length) {
    console.error("");
    console.error("seat totals failed:");
    for (const r of overTotals) console.error(overText(r));
  }
  if (over.length || overTotals.length) return 1;
  console.log("");
  console.log(
    "size budget ok — none over cap" +
      (bands.length ? ", " + bands.length + " in the band:" : ", nothing in the band") +
      (bands.length ? NL + bands.map((r) => "  " + r.label + " " + pct(r).toFixed(1) + "%").join(NL) : ""),
  );
  return 0;
}

// A tree of its own, so the three cases below are bytes this file wrote and
// not the kit's own numbers drifting under the test. Envelopes and context caps
// are arguments, because the six properties below need more than one shape of
// tree and a second writer of the same tree would be a second thing to keep in
// step with packet.mjs.
function fixture(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "grok-budget-"));
  mkdirSync(join(dir, "factory/envelopes"), { recursive: true });
  mkdirSync(join(dir, "probes"), { recursive: true });
  writeFileSync(join(dir, "AGENTS.md"), "# AGENTS.md" + NL + NL + "Short on purpose." + NL);
  writeFileSync(join(dir, "BOARD.md"), "# BOARD" + NL);
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
  // The control-plane packet reads these two, so the fixture carries them.
  writeFileSync(join(dir, "factory/CONTROL_PLANE.md"), "# Control plane" + NL);
  writeFileSync(
    join(dir, "factory/sparks.json"),
    JSON.stringify({ sitting: 0, note: "Look, not law.", items: [] }) + NL,
  );
  for (const [lane, bytes] of Object.entries(opts.envelopes || { F00: 200 })) {
    writeFileSync(join(dir, "factory/envelopes", lane + ".md"), Buffer.alloc(bytes, 101));
  }
  writeFileSync(
    join(dir, "factory/budgets.json"),
    JSON.stringify({
      files: opts.files || [{ path: "probes/band.md", capKb: 10 }],
      globs: [],
      context: opts.context || { seatPacketKb: 100, cpPacketKb: 100, envelopeKb: 1 },
    }) + NL,
  );
  return dir;
}

// S21's six properties, one tree each. Every number is read back out of a
// report — this tool's own, or packet.mjs in a real process — so no fixture
// compares a number with itself, and a fixture that could not have printed the
// other answer is a fixture that proves nothing (T79). Each property below is
// paired with the one mutation that reds it alone.
function seatTotalProps() {
  const errors = [];
  const cli = fileURLToPath(import.meta.url);
  const packetCli = fileURLToPath(new URL("./packet.mjs", import.meta.url));
  const trees = [];
  const tree = (opts) => {
    const dir = fixture(opts);
    trees.push(dir);
    return dir;
  };
  const run = (dir) => {
    const r = spawnSync(process.execPath, [cli, "--root", dir], { encoding: "utf8" });
    return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  };
  // The number a seat is handed, straight out of the tool that hands it over.
  const seatKb = (dir, lane) => {
    const r = spawnSync(process.execPath, [packetCli, "seat", lane, "--root", dir], { encoding: "utf8" });
    const m = /packet seat[^\n]*?(\d+\.\d+) KB/.exec(r.stderr || "");
    return m ? Number(m[1]) : NaN;
  };
  // One report line, split into the two numbers it prints: the bytes it
  // measured and the cap it measured them against.
  const row = (text, needle) => {
    const l = text.split(NL).find((x) => x.includes(needle));
    if (!l) return null;
    const m = /(\d+\.\d+)\s*\/\s*(\d+\.\d+) KB/.exec(l);
    return m ? { line: l, bytesKb: Number(m[1]), capKb: Number(m[2]) } : null;
  };
  // The shared band, found by what it is: the row that is a packet and is
  // neither the control plane's nor a lane's. A label mutation still lands on
  // it, so the label assertion below can red for its own reason.
  const sharedBand = (text) =>
    text
      .split(NL)
      .find(
        (l) => /\/\s*\d+\.\d+ KB/.test(l) && /packet/.test(l) && !/control-plane/.test(l) && !/seat total/.test(l),
      ) || "";
  const caps = { seatPacketKb: 26, cpPacketKb: 44, envelopeKb: 6 };

  // P1 — the lane total is what `packet.mjs seat <LANE>` prints. The envelope
  // is a size no other number here would produce, so a total that measured the
  // envelope alone, or the envelope twice, cannot agree with the seat.
  const d1 = tree({ envelopes: { F00: 1234 }, context: caps });
  const r1 = run(d1);
  const p1 = row(r1.out, "seat total F00");
  if (p1 === null) {
    errors.push("P1: no seat total row for F00: " + r1.out.trim());
  } else {
    const seat1 = seatKb(d1, "F00");
    // The prefix the total must contain is derived from packet.mjs, not read
    // off the report: this property is about the total agreeing with the seat,
    // and a prefix row that lied must red the prefix's own property below.
    const pre1 = Number((total(seatPacket(d1, null)) / 1024).toFixed(1));
    if (Number.isNaN(seat1)) errors.push("P1: packet.mjs seat F00 printed no meter");
    else if (seat1 !== p1.bytesKb) {
      errors.push("P1: the report says " + p1.bytesKb + " KB for F00, packet.mjs seat F00 says " + seat1 + " KB");
    }
    // If the total did not include the prefix it would be below it.
    if (!(p1.bytesKb > pre1)) {
      errors.push("P1: the seat total for F00 is not above the prefix it must contain: " + p1.line);
    }
  }
  if (r1.status !== 0) errors.push("P1: a tree under its caps exited " + r1.status + ": " + r1.out.trim());

  // P2 — no envelope issued: the report says so and PASSES. The positive fact
  // is asserted against the other arm of the same fixture, so the assertion can
  // fail: the sentence must be present with no envelope and absent with one.
  const r2none = run(tree({ envelopes: {}, context: caps }));
  const r2one = run(tree({ envelopes: { F00: 1234 }, context: caps }));
  if (r2none.status !== 0) {
    errors.push("P2: a tree with no envelope exited " + r2none.status + ": " + r2none.out.trim());
  }
  if (!/no envelope issued — nothing to measure/.test(r2none.out)) {
    errors.push("P2: a tree with no envelope did not say so: " + r2none.out.trim());
  }
  if (/no envelope issued/.test(r2one.out)) {
    errors.push("P2: a tree with an envelope claimed there was none to measure: " + r2one.out.trim());
  }
  if (!/seat total F00/.test(r2one.out)) {
    errors.push("P2: a tree with an envelope reported no lane total: " + r2one.out.trim());
  }
  const bands2 = sharedBand(r2none.out);
  if (!bands2) errors.push("P2: no envelope left the prefix unmeasured: " + r2none.out.trim());

  // P3 — over the combined cap fails and names the offending lane, and only
  // the offending lane. F01 is over, F00 is under, and F00 appears in the table
  // above the failure, so the assertion is about the failure block alone.
  const d3 = tree({ envelopes: { F00: 200, F01: 40000 }, context: caps });
  const r3 = run(d3);
  if (r3.status === 0) errors.push("P3: a lane over the combined cap exited 0: " + r3.out.trim());
  const at3 = r3.out.indexOf("seat totals failed:");
  if (at3 < 0) {
    errors.push("P3: no seat totals failure block: " + r3.out.trim());
  } else {
    const block = r3.out.slice(at3);
    if (!block.includes("seat total F01")) errors.push("P3: the failure did not name the offending lane: " + block.trim());
    if (block.includes("F00")) errors.push("P3: the failure named a lane that is under its cap: " + block.trim());
    const f01 = row(r3.out, "seat total F01");
    if (!f01 || f01.capKb !== caps.seatPacketKb + caps.envelopeKb) {
      errors.push("P3: the combined cap is not seatPacketKb + envelopeKb: " + (f01 || {}).line);
    }
  }

  // P4 — the prefix band is unchanged: same object, same cap, same verdict,
  // same byte count. The byte count is the one packet.mjs derives for the same
  // tree, and the verdict is pair-asserted, so neither half can drift silently.
  // The row is located by what it is, so the label assertion below is the one a
  // label change reds.
  const d4 = tree({ envelopes: { F00: 200 }, context: caps });
  const r4 = run(d4);
  const band4 = sharedBand(r4.out);
  if (!band4) {
    errors.push("P4: no prefix row: " + r4.out.trim());
  } else {
    const metrics4 = row(r4.out, band4.replace(/.*KB  /, ""));
    const want4 = Number((total(seatPacket(d4, null)) / 1024).toFixed(1));
    if (!metrics4 || metrics4.bytesKb !== want4) {
      errors.push("P4: the prefix row says " + (metrics4 || {}).bytesKb + " KB, the prefix is " + want4 + " KB");
    }
    if (!metrics4 || metrics4.capKb !== caps.seatPacketKb) {
      errors.push("P4: the prefix row is not capped at seatPacketKb: " + band4.trim());
    }
  }
  if (r4.status !== 0) errors.push("P4: a prefix under its cap failed the step: " + r4.out.trim());
  if (/BAND/.test(band4)) errors.push("P4: a prefix under its cap was banded: " + r4.out.trim());
  const r4over = run(tree({ envelopes: { F00: 200 }, context: { ...caps, seatPacketKb: 0.001 } }));
  if (r4over.status === 0) errors.push("P4: a prefix over its cap exited 0: " + r4over.out.trim());
  const band4over = sharedBand(r4over.out);
  const failed4 = r4over.out.slice(r4over.out.indexOf("size budget failed:"));
  if (!band4over || !failed4.includes(band4over.replace(/.*KB  /, ""))) {
    errors.push("P4: an over-cap prefix was not named: " + r4over.out.trim());
  }

  // P5 — both caps come from factory/budgets.json, and the verdict moves when
  // either one moves. The caps are cut from the sizes this tree actually
  // measures, so a hardcoded cap could not agree with them. The prefix is given
  // 1 KB of slack and the envelope's own cap is set below the envelope it caps,
  // which is the one shape where the LANE is the row that decides the run: so
  // the verdict is read from the seat-totals block, not from the exit code.
  const env5 = { F00: 4096 };
  const d5 = tree({ envelopes: env5, context: caps });
  const preKb = total(seatPacket(d5, null)) / 1024;
  const envKb = total(seatPacket(d5, "F00")) / 1024 - preKb;
  const at5 = (seatKb5, envKb5) => {
    const r = run(tree({ envelopes: env5, context: { ...caps, seatPacketKb: seatKb5, envelopeKb: envKb5 } }));
    const i = r.out.indexOf("seat totals failed:");
    return { out: r.out, fail: i >= 0 && r.out.slice(i).includes("seat total F00"), lane: row(r.out, "seat total F00") };
  };
  const tight = envKb - 1.5; // combined = the total - 0.5 KB
  const fail5 = at5(preKb + 1, tight);
  const pass5 = at5(preKb + 2, tight); // seatPacketKb moved up
  const pass5b = at5(preKb + 1, tight + 1); // envelopeKb moved up
  if (!fail5.fail) errors.push("P5: a total over the combined cap was not failed: " + fail5.out.trim());
  if (pass5.fail) errors.push("P5: raising seatPacketKb did not move the verdict: " + pass5.out.trim());
  if (pass5b.fail) errors.push("P5: raising envelopeKb did not move the verdict: " + pass5b.out.trim());
  // The cap printed is seatPacketKb + envelopeKb, both from the file: preKb + 1
  // and envKb - 1.5 were written into it, so their sum is the only cap that
  // agrees.
  if (!fail5.lane || fail5.lane.capKb !== Number((preKb + envKb - 0.5).toFixed(1))) {
    errors.push("P5: the cap printed is not seatPacketKb + envelopeKb from the file: " + (fail5.lane || {}).line);
  }

  // P6 — the label no longer calls the prefix the seat packet, and the total is
  // labelled as what a seat receives, so a reader cannot mistake one for the
  // other. The shared band is located by what it is, not by the text asserted
  // here, so this assertion is the thing that reds.
  const r6 = run(tree({ envelopes: { F00: 1234 }, context: caps }));
  const pre6 = sharedBand(r6.out);
  const lane6 = row(r6.out, "seat total F00");
  if (!pre6) errors.push("P6: no shared band to label: " + r6.out.trim());
  else {
    if (!/prefix/.test(pre6)) errors.push("P6: the shared band is not labelled the prefix: " + pre6.trim());
    if (/seat packet/i.test(pre6)) errors.push("P6: the prefix is still called the seat packet: " + pre6.trim());
  }
  if (!lane6) errors.push("P6: no lane total to label: " + r6.out.trim());
  else {
    if (!lane6.line.includes("F00")) errors.push("P6: the total does not name its lane: " + lane6.line);
    if (!/seat total/.test(lane6.line)) {
      errors.push("P6: the total is not labelled as what a seat receives: " + lane6.line);
    }
    if (lane6.line.replace(/.*  /, "") === pre6.replace(/.*  /, "")) {
      errors.push("P6: the prefix and the total carry the same label: " + lane6.line);
    }
  }

  for (const dir of trees) rmSync(dir, { recursive: true, force: true });
  return errors;
}

function selfTest() {
  const errors = [];
  const dir = fixture();
  const cli = fileURLToPath(import.meta.url);
  // Real exit codes, from a real process, on a tree this test wrote.
  const probe = (bytes) => {
    writeFileSync(join(dir, "probes/band.md"), Buffer.alloc(bytes, 97));
    const r = spawnSync(process.execPath, [cli, "--root", dir], { encoding: "utf8" });
    return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  };
  try {
    const under = probe(8090); // 79.0 per cent of a 10 KB cap
    if (under.status !== 0) {
      errors.push("79 per cent of a cap failed the step: " + under.status + " " + under.out.trim());
    }
    if (under.out.includes("BAND")) errors.push("79 per cent of a cap was banded");

    const edge = probe(8192); // exactly 80.0 per cent
    if (edge.status !== 0) {
      errors.push("80 per cent of a cap failed the step: " + edge.status + " " + edge.out.trim());
    }
    if (!edge.out.includes("BAND")) errors.push("80 per cent of a cap was not banded");

    const over = probe(10241); // over the 10 KB cap
    if (over.status === 0) errors.push("a file over its cap exited 0");
    if (!over.out.includes("probes/band.md")) errors.push("an over-cap file was not named");

    const rows = measures(dir);
    const kinds = rows.map((r) => r.kind).join(" | ");
    // Found by what a row IS, not by the text of a label: the labels below are
    // one of the six properties, so a label mutation must not red this lookup.
    for (const want of ["envelope", "prefix", "cp"]) {
      if (!rows.some((r) => r.kind === want)) errors.push("no row of kind " + want + ": " + kinds);
    }
    const cap = rows.find((r) => r.kind === "prefix");
    if (!(cap.capKb === 100)) errors.push("the context caps are not read from the tree being measured");
    // The prefix row measures the prefix: no lane, so no envelope.
    if (cap.bytes !== total(seatPacket(dir, null))) {
      errors.push("the prefix row does not measure the prefix");
    }
    const tot = seatTotals(dir);
    if (tot.length !== 1 || tot[0].lane !== "F00") {
      errors.push("one envelope issued must give one lane total: " + JSON.stringify(tot));
    }

    // A row whose cap is missing in the file being measured: the tool must
    // print it and fail with the named message. It used to call capKb.toFixed(1)
    // in the report line, before overCap could route the row, so the run exited
    // on a TypeError and the promised failure never printed.
    writeFileSync(join(dir, "probes/nocap.md"), Buffer.alloc(64, 97));
    writeFileSync(join(dir, "probes/band.md"), Buffer.alloc(8090, 97)); // back under its cap
    writeFileSync(
      join(dir, "factory/budgets.json"),
      JSON.stringify({
        files: [
          { path: "probes/band.md", capKb: 10 },
          { path: "probes/nocap.md" },
          // A cap that is a string, not a number: 4 KB is under the 10 it says,
          // so a tool that coerces the string measures it against 10 KB and
          // passes it, while the report line prints `n/a` and `no cap`. One run,
          // two answers. It is a missing cap, and it must be named as one.
          { path: "probes/strcap.md", capKb: "10" },
        ],
        globs: [],
        context: { seatPacketKb: 100, cpPacketKb: 100, envelopeKb: 1 },
      }) + NL,
    );
    writeFileSync(join(dir, "probes/strcap.md"), Buffer.alloc(4096, 97));
    const nocap = spawnSync(process.execPath, [cli, "--root", dir], { encoding: "utf8" });
    const nocapOut = (nocap.stdout || "") + (nocap.stderr || "");
    if (nocap.status === 0) errors.push("a row with no capKb exited 0");
    if (!nocapOut.includes("no capKb in the file being measured")) {
      errors.push("a row with no capKb did not fail with the named message: " + nocapOut.trim());
    }
    // Once in the table, once in the failure: two mentions pin the report line
    // as the part that used to throw.
    if (nocapOut.split("probes/nocap.md").length - 1 < 2) {
      errors.push(
        "the no-capKb row was not printed in the table and again in the failure: " + nocapOut.trim(),
      );
    }
    if (/TypeError|Cannot read propert/.test(nocapOut)) {
      errors.push("a row with no capKb threw instead of printing the message: " + nocapOut.trim());
    }
    const strcapLine = nocapOut
      .split(NL)
      .find((l) => l.includes("probes/strcap.md") && l.includes("no capKb in the file being measured"));
    if (!strcapLine) {
      errors.push("a cap that is a string was not treated as a missing one: " + nocapOut.trim());
    }

    errors.push(...seatTotalProps());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (errors.length) {
    console.error("sizeBudget self-test failed");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("sizeBudget self-test ok");
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

process.exit(run(rootFrom(process.argv)));
