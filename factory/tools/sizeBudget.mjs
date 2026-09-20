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
// the seat packet, the control-plane packet, an envelope — are measured
// through packet.mjs, so this step and the packet steps cannot disagree about
// the same number.

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

// Every file a budget names, every match of a glob a budget names, and the
// three budgets that are not files at all. The envelope row is the largest
// envelope issued, which is the binding one.
export function measures(root) {
  const budgets = JSON.parse(readFileSync(join(root, "factory/budgets.json"), "utf8"));
  // A cap that is not a number is a missing cap, not a smaller one. `"10" * 1024`
  // coerces in banded() and pct() while Number.isFinite refuses it in the report,
  // so one run would band a row at 10 KB and print `n/a` for it: one run, two
  // answers. Normalize at the read, so every reader sees the same cap, and a
  // non-number cap lands in the failure column with a name.
  const capOf = (v) => (Number.isFinite(v) ? v : undefined);
  for (const f of budgets.files || []) f.capKb = capOf(f.capKb);
  for (const g of budgets.globs || []) g.capKb = capOf(g.capKb);
  for (const k of ["seatPacketKb", "cpPacketKb", "envelopeKb"]) {
    if (budgets.context) budgets.context[k] = capOf(budgets.context[k]);
  }
  const rows = [];
  for (const file of budgets.files || []) {
    const full = join(root, file.path);
    if (existsSync(full)) rows.push({ label: file.path, bytes: sizeOf(full), capKb: file.capKb });
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
    label: issued.length ? "envelope (largest of " + issued.length + ")" : "envelope (none issued)",
    bytes: largest,
    capKb: context.envelopeKb,
  });
  rows.push({ label: "seat packet", bytes: total(seatPacket(root, null)), capKb: context.seatPacketKb });
  rows.push({
    label: "control-plane packet",
    bytes: total(cpPacket(root, null)),
    capKb: context.cpPacketKb,
  });
  return rows;
}

function pct(row) {
  return (row.bytes * 100) / (row.capKb * 1024);
}

// A band is scheduled work, so it is a per-cent comparison in integers: the
// edge at exactly 80 per cent must not depend on a float's last bit.
function banded(row) {
  return row.bytes * 100 >= row.capKb * 1024 * BAND;
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
  const over = rows.filter(overCap);
  const bands = rows.filter((r) => !overCap(r) && banded(r));
  console.log("size budget — " + rows.length + " budgets, bands at " + BAND + " per cent" + NL);
  for (const row of rows) console.log(line(row));
  if (over.length) {
    console.error("");
    console.error("size budget failed:");
    for (const r of over) {
      console.error(
        "  " +
          r.label +
          " " +
          (r.bytes / 1024).toFixed(1) +
          " KB > " +
          (Number.isFinite(r.capKb) ? r.capKb + " KB" : "no capKb in the file being measured"),
      );
    }
    return 1;
  }
  console.log("");
  console.log(
    "size budget ok — none over cap" +
      (bands.length ? ", " + bands.length + " in the band:" : ", nothing in the band") +
      (bands.length ? NL + bands.map((r) => "  " + r.label + " " + pct(r).toFixed(1) + "%").join(NL) : ""),
  );
  return 0;
}

// A tree of its own, so the three cases below are bytes this file wrote and
// not the kit's own numbers drifting under the test.
function fixture() {
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
  writeFileSync(join(dir, "factory/envelopes/F00.md"), "e".repeat(200));
  writeFileSync(
    join(dir, "factory/budgets.json"),
    JSON.stringify({
      files: [{ path: "probes/band.md", capKb: 10 }],
      globs: [],
      context: { seatPacketKb: 100, cpPacketKb: 100, envelopeKb: 1 },
    }) + NL,
  );
  return dir;
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
    const labels = rows.map((r) => r.label).join(" | ");
    for (const want of ["envelope (largest of 1)", "seat packet", "control-plane packet"]) {
      if (!labels.includes(want)) errors.push("no row for the " + want + " budget: " + labels);
    }
    const cap = rows.find((r) => r.label === "seat packet");
    if (!(cap.capKb === 100)) errors.push("the context caps are not read from the tree being measured");

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
