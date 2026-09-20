#!/usr/bin/env node
// Sparks are look-not-law. Waivers are not git. Sitting close is the funeral.
//
//   node factory/tools/spark.mjs add --kind trap --claim "..." --object path --why "..."
//   node factory/tools/spark.mjs drop S01 --because "..."
//   node factory/tools/spark.mjs absorb S01 --as T41
//   node factory/tools/spark.mjs look
//   node factory/tools/spark.mjs close
//   node factory/tools/spark.mjs rotate
//   node factory/tools/spark.mjs check
//   node factory/tools/spark.mjs --self-test
//
// An open spark is live and is read by every control-plane packet. An absorbed
// or dropped one is history: it moves to docs/sparks/<YYYY-MM>.md, as the
// ledger window moves to docs/ledger (D-52). The window is the status, not a
// count, so a store with nothing closed rotates to nothing.

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const KINDS = new Set(["trap", "lesson", "practice", "drop"]);
const STATUSES = new Set(["open", "absorbed", "dropped"]);
const KEYS = new Set([
  "id",
  "kind",
  "claim",
  "object",
  "whyNotLaw",
  "status",
  "openedOn",
  "because",
  "absorbedAs",
]);
const MAX_OPEN = 5;
const MAX_CLAIM = 240;
const GRACE = 1;
const ID_RE = /^S\d{2,}$/;

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);
const ARCHIVE_DIR = "docs/sparks";
const CLOSED = new Set(["absorbed", "dropped"]);

function fail(label, errors) {
  console.error(label);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sparksPath(root) {
  return join(root, "factory/sparks.json");
}

function loadSparks(root) {
  const p = sparksPath(root);
  if (!existsSync(p)) throw new Error("factory/sparks.json missing");
  return loadJson(p);
}

function saveSparks(root, data) {
  writeFileSync(sparksPath(root), JSON.stringify(data, null, 2) + "\n");
}

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const n = argv[i + 1];
      if (n && !n.startsWith("--")) {
        flags[k] = n;
        i++;
      } else flags[k] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

function neverMove(claim, object) {
  const blob = `${object} ${claim}`.toLowerCase();
  return (
    blob.includes("agents.md") &&
    /(§\s*5|section 5|never-move|never move)/.test(blob)
  );
}

function nextId(items) {
  let max = 0;
  for (const it of items) {
    const m = /^S(\d+)$/.exec(it.id || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return "S" + String(max + 1).padStart(2, "0");
}

function itemErrors(it) {
  const errors = [];
  if (!it || typeof it !== "object" || Array.isArray(it)) return ["not an object"];
  const extra = Object.keys(it).filter((k) => !KEYS.has(k));
  if (extra.length) errors.push(it.id + " unknown fields: " + extra.join(", "));
  if (!ID_RE.test(it.id || "")) errors.push("id");
  if (!KINDS.has(it.kind)) errors.push(it.id + " kind");
  if (typeof it.claim !== "string" || it.claim.trim().length < 12) {
    errors.push(it.id + " claim");
  }
  if (typeof it.claim === "string" && it.claim.length > MAX_CLAIM) {
    errors.push(it.id + " claim too long");
  }
  if (typeof it.claim === "string" && /\n/.test(it.claim)) {
    errors.push(it.id + " claim is not one sentence");
  }
  if (typeof it.object !== "string" || it.object.trim().length < 3) {
    errors.push(it.id + " object");
  }
  if (typeof it.whyNotLaw !== "string" || it.whyNotLaw.trim().length < 8) {
    errors.push(it.id + " whyNotLaw");
  }
  if (!STATUSES.has(it.status)) errors.push(it.id + " status");
  if (!Number.isInteger(it.openedOn) || it.openedOn < 1) {
    errors.push(it.id + " openedOn");
  }
  if (it.status === "dropped" && !(it.because && String(it.because).trim())) {
    errors.push(it.id + " drop needs because");
  }
  if (it.status === "absorbed" && !(it.absorbedAs && String(it.absorbedAs).trim())) {
    errors.push(it.id + " absorb needs absorbedAs");
  }
  if (neverMove(it.claim, it.object)) {
    errors.push(it.id + " would weaken AGENTS §5");
  }
  return errors;
}

function check(root) {
  const errors = [];
  const p = sparksPath(root);
  if (!existsSync(p)) {
    return ["factory/sparks.json missing"];
  }
  let data;
  try {
    data = loadSparks(root);
  } catch (err) {
    return ["factory/sparks.json: " + String(err.message || err)];
  }
  if (!Number.isInteger(data.sitting) || data.sitting < 1) errors.push("sitting");
  if (!Array.isArray(data.items)) errors.push("items");
  if (typeof data.note !== "string" || !/look, not law/i.test(data.note)) {
    errors.push("note must say look, not law");
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const open = items.filter((it) => it.status === "open");
  if (open.length > MAX_OPEN) errors.push("too many open sparks");
  const ids = new Set();
  for (const it of items) {
    errors.push(...itemErrors(it));
    if (it.id) {
      if (ids.has(it.id)) errors.push("dup " + it.id);
      ids.add(it.id);
    }
    if (it.status === "open" && data.sitting - it.openedOn > GRACE) {
      errors.push(it.id + " overdue — absorb or drop");
    }
  }

  const waiver = join(root, "factory/.waiver");
  const hasGit = existsSync(join(root, ".git"));
  if (hasGit) {
    const r = spawnSync("git", ["-C", root, "ls-files", "--error-unmatch", "factory/.waiver"], {
      encoding: "utf8",
    });
    if (r.status === 0) errors.push("factory/.waiver is tracked");
  } else if (existsSync(waiver)) {
    errors.push("factory/.waiver present in archive");
  }
  return errors;
}

function kitMarkers() {
  const errors = [];
  const agents = readFileSync(join(kitRoot, "AGENTS.md"), "utf8");
  const cp = readFileSync(join(kitRoot, "factory/CONTROL_PLANE.md"), "utf8");
  const sessions = readFileSync(join(kitRoot, "factory/sessions.json"), "utf8");
  const gi = readFileSync(join(kitRoot, ".gitignore"), "utf8");
  const landing = readFileSync(join(kitRoot, "factory/landing-checks.json"), "utf8");
  if (!/factory\/sparks\.json/i.test(agents)) errors.push("AGENTS.md missing sparks.json");
  if (!/look, not law/i.test(cp)) errors.push("CONTROL_PLANE.md missing look, not law");
  if (!/waiver/i.test(cp)) errors.push("CONTROL_PLANE.md missing waiver");
  if (!/spark\.mjs/i.test(cp)) errors.push("CONTROL_PLANE.md missing spark.mjs");
  if (!/sparks\.json/i.test(sessions)) errors.push("sessions.json successorReads missing sparks");
  if (!/\.waiver/i.test(sessions)) errors.push("sessions.json successorNever missing .waiver");
  if (!/CONTROL_PLANE\.md/.test(sessions)) {
    errors.push("sessions.json successorReads missing CONTROL_PLANE.md (T58)");
  }
  if (!/packet\.mjs/.test(sessions)) {
    errors.push("sessions.json successorReads missing the packet (T61)");
  }
  if (!/factory\/\.waiver/.test(gi)) errors.push(".gitignore missing factory/.waiver");
  if (!/spark\.mjs --self-test/.test(landing)) {
    errors.push("landing-checks.json missing spark self-test");
  }
  return errors;
}

function cmdAdd(root, flags) {
  const data = loadSparks(root);
  const kind = flags.kind;
  const claim = String(flags.claim || "").trim();
  const object = String(flags.object || "").trim();
  const why = String(flags.why || "").trim();
  if (neverMove(claim, object)) {
    fail("spark add refused", ["would weaken AGENTS §5 — that is an owner gate"]);
  }
  const item = {
    id: nextId(data.items),
    kind,
    claim,
    object,
    whyNotLaw: why,
    status: "open",
    openedOn: data.sitting,
  };
  const shape = itemErrors(item);
  if (shape.length) fail("spark add refused", shape);
  const open = data.items.filter((it) => it.status === "open").length;
  if (open >= MAX_OPEN) fail("spark add refused", ["too many open sparks"]);
  data.items.push(item);
  saveSparks(root, data);
  console.log(item.id + " open on sitting " + data.sitting);
}

function cmdSetStatus(root, id, status, extra) {
  const data = loadSparks(root);
  const item = data.items.find((it) => it.id === id);
  if (!item) fail("spark " + status, [id + " not found"]);
  if (item.status !== "open") fail("spark " + status, [id + " is " + item.status]);
  item.status = status;
  Object.assign(item, extra);
  const shape = itemErrors(item);
  if (shape.length) fail("spark " + status, shape);
  saveSparks(root, data);
  console.log(id + " " + status);
}

function cmdLook(root) {
  const data = loadSparks(root);
  const open = data.items.filter((it) => it.status === "open");
  console.log("sitting " + data.sitting + " — look, not law");
  if (!open.length) {
    console.log("no open sparks");
    return;
  }
  for (const it of open) {
    const age = data.sitting - it.openedOn;
    console.log(
      it.id +
        " " +
        it.kind +
        " age " +
        age +
        "\n  claim: " +
        it.claim +
        "\n  object: " +
        it.object +
        "\n  whyNotLaw: " +
        it.whyNotLaw,
    );
  }
}

function cmdClose(root) {
  const data = loadSparks(root);
  const errors = [];
  const hasGit = existsSync(join(root, ".git"));
  if (hasGit) {
    const r = spawnSync("git", ["-C", root, "ls-files", "--error-unmatch", "factory/.waiver"], {
      encoding: "utf8",
    });
    if (r.status === 0) errors.push("factory/.waiver is tracked");
  }
  const waiver = join(root, "factory/.waiver");
  for (const it of data.items) {
    if (it.status !== "open") continue;
    const age = data.sitting - it.openedOn;
    if (age > GRACE) errors.push(it.id + " overdue");
    if (age === GRACE) errors.push(it.id + " absorb or drop before close");
  }
  if (errors.length) fail("sitting close refused", errors);
  if (existsSync(waiver)) unlinkSync(waiver);
  data.sitting += 1;
  saveSparks(root, data);
  console.log("sitting " + data.sitting + " — waivers expired");
  cmdLook(root);
}

// A closed spark is history and leaves the file every control-plane packet
// reads. The archive holds the closed rows in the order the file held them,
// which is the order they were opened in; the live file holds the open ones in
// that same order. Rotation is not a reversible transform. The two files are
// windows over one append-only list, and a row carries no slot, because a
// second rotation numbers the list it is left with: a slot written by the
// first rotation would name a different row in the second. Read the archive
// before appending to it: a spark whose row is already there is not written
// twice (T65). The month is the host clock, read in the same act as the write
// (T04).
function rotate(root, { write = true, now = new Date() } = {}) {
  const data = loadSparks(root);
  const items = Array.isArray(data.items) ? data.items : [];
  const open = items.filter((it) => it.status === "open");
  const closed = items.filter((it) => CLOSED.has(it.status));
  if (!closed.length) return { moved: 0, kept: open.length, files: [] };
  const key = now.toISOString().slice(0, 7);
  const rel = ARCHIVE_DIR + "/" + key + ".md";
  if (!write) return { moved: closed.length, kept: open.length, files: [rel] };
  const abs = join(root, rel);
  mkdirSync(join(root, ARCHIVE_DIR), { recursive: true });
  const head =
    "# Sparks " +
    key +
    NL +
    NL +
    "Archived from factory/sparks.json. History, not the reading path. One JSON line per spark, " +
    "in the order the file held them. Rotation is not reversible: this file holds the closed rows, " +
    "the live file the open ones, and neither rebuilds the other." +
    NL +
    NL;
  const prev = existsSync(abs) ? readFileSync(abs, "utf8") : head;
  const seen = new Set();
  for (const row of prev.split(NL)) {
    if (!row.startsWith("{")) continue;
    try {
      const it = JSON.parse(row);
      if (it && it.id) seen.add(it.id);
    } catch {
      // Not a row this file wrote. Leave it where it is.
    }
  }
  const fresh = items.filter((it) => CLOSED.has(it.status) && !seen.has(it.id));
  if (fresh.length) {
    const body = prev.endsWith(NL) ? prev : prev + NL;
    writeFileSync(abs, body + fresh.map((it) => JSON.stringify(it)).join(NL) + NL);
  }
  data.items = open;
  saveSparks(root, data);
  return { moved: fresh.length, kept: open.length, files: fresh.length ? [rel] : [] };
}

function writeFixture(dir, sparks, waiver) {
  mkdirSync(join(dir, "factory"), { recursive: true });
  writeFileSync(sparksPath(dir), JSON.stringify(sparks, null, 2) + "\n");
  if (waiver) writeFileSync(join(dir, "factory/.waiver"), waiver);
}

function selfTest() {
  const errors = kitMarkers();
  const live = check(kitRoot);
  if (live.length) errors.push(...live.map((e) => "live: " + e));

  const dir = mkdtempSync(join(tmpdir(), "grok-spark-"));
  try {
    writeFixture(
      dir,
      {
        sitting: 1,
        note: "Look, not law. Absorb or drop next sitting.",
        items: [],
      },
      null,
    );
    cmdAdd(dir, {
      kind: "trap",
      claim: "A control-plane sitting is one class of work.",
      object: "factory/sessions.json",
      why: "no check yet that a second class of work fails",
    });
    const afterAdd = loadSparks(dir);
    if (afterAdd.items.length !== 1 || afterAdd.items[0].id !== "S01") {
      errors.push("add did not mint S01");
    }
    cmdClose(dir);
    const afterClose = loadSparks(dir);
    if (afterClose.sitting !== 2) errors.push("close did not increment sitting");

    writeFixture(
      dir,
      {
        sitting: 3,
        note: "Look, not law. Absorb or drop next sitting.",
        items: [
          {
            id: "S01",
            kind: "trap",
            claim: "A leftover spark must fail the gate.",
            object: "factory/sessions.json",
            whyNotLaw: "overdue fixture",
            status: "open",
            openedOn: 1,
          },
        ],
      },
      null,
    );
    const overdue = check(dir);
    if (!overdue.some((e) => /overdue/.test(e))) {
      errors.push("overdue spark did not fail check");
    }

    writeFixture(
      dir,
      {
        sitting: 1,
        note: "Look, not law. Absorb or drop next sitting.",
        items: [],
      },
      '{ "allow": ["skip the landing gate"] }\n',
    );
    const waived = check(dir);
    if (!waived.some((e) => /waiver/.test(e))) {
      errors.push("archive waiver did not fail check");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // Rotate: the window is the status. Absorbed and dropped leave the file the
  // packet reads and open stays, each in the order the file held it, and a
  // second run with nothing closed moves nothing and touches no open spark.
  const dir3 = mkdtempSync(join(tmpdir(), "grok-spark3-"));
  try {
    // The ids below are not in ascending order on purpose. The file is
    // append-only, so the order it holds is opening order, and a rotate that
    // sorted its rows would pass a set comparison and fail the order
    // assertion (a) below.
    const items = [
      {
        id: "S04",
        kind: "trap",
        claim: "An absorbed spark must leave the control-plane packet.",
        object: "factory/tools/spark.mjs",
        whyNotLaw: "fixture, no check yet",
        status: "absorbed",
        openedOn: 1,
        absorbedAs: "T99",
      },
      {
        id: "S01",
        kind: "lesson",
        claim: "An open spark must stay where a seat reads it.",
        object: "factory/sparks.json",
        whyNotLaw: "fixture, no check yet",
        status: "open",
        openedOn: 4,
      },
      {
        id: "S02",
        kind: "trap",
        claim: "An absorbed spark keeps its place in the archive.",
        object: "factory/tools/spark.mjs",
        whyNotLaw: "fixture, no check yet",
        status: "absorbed",
        openedOn: 2,
        absorbedAs: "T98",
      },
      {
        id: "S03",
        kind: "lesson",
        claim: "A dropped spark must leave the packet as well.",
        object: "factory/sparks.json",
        whyNotLaw: "fixture, no check yet",
        status: "dropped",
        openedOn: 3,
        because: "fixture",
      },
    ];
    const rel = ARCHIVE_DIR + "/2026-09.md";
    const archived = () =>
      readFileSync(join(dir3, rel), "utf8")
        .split(NL)
        .filter((row) => row.startsWith("{"))
        .map((row) => JSON.parse(row));
    writeFixture(
      dir3,
      { sitting: 5, note: "Look, not law. Absorb or drop next sitting.", items },
      null,
    );

    const first = rotate(dir3, { now: new Date("2026-09-20T00:00:00Z") });
    if (first.moved !== 3 || first.kept !== 1) {
      errors.push("rotate moved " + first.moved + " kept " + first.kept + ", not 3 and 1");
    }
    if (first.files.length !== 1 || first.files[0] !== rel) {
      errors.push("rotate named the wrong archive: " + first.files.join(", "));
    }
    const live = loadSparks(dir3);
    if (live.items.length !== 1 || live.items[0].id !== "S01") {
      errors.push("rotate did not keep exactly the open spark");
    }
    if (check(dir3).length) {
      errors.push("rotate left the live file failing its own check: " + check(dir3).join("; "));
    }
    const closed = items.filter((it) => CLOSED.has(it.status));
    const open = items.filter((it) => it.status === "open");
    const asRows = (list) => JSON.stringify(list.map((it) => JSON.stringify(it)));
    // (a) The archive is the closed rows, byte-exact, in the order the file
    // held them. A rotate that sorted its rows fails this.
    const archivedRows = archived();
    if (asRows(archivedRows) !== asRows(closed)) {
      errors.push("the archive does not hold the closed rows in file order: " + asRows(archivedRows));
    }
    // (b) The live file is the open rows, byte-exact, in that same order.
    if (asRows(live.items) !== asRows(open)) {
      errors.push("the live file does not hold the open rows byte-exact");
    }

    const again = rotate(dir3, { now: new Date("2026-09-20T00:00:00Z") });
    if (again.moved !== 0 || again.files.length !== 0) {
      errors.push("a second rotate moved " + again.moved);
    }

    // A closed spark back in the live file whose row the archive already holds
    // is removed from the live file, not appended a second time (T65).
    const dupId = items[0].id;
    const back = loadSparks(dir3);
    back.items.push(items[0]);
    saveSparks(dir3, back);
    const dedup = rotate(dir3, { now: new Date("2026-09-20T00:00:00Z") });
    if (dedup.moved !== 0) errors.push("rotate appended a spark the archive already held");
    const rows = readFileSync(join(dir3, rel), "utf8")
      .split(NL)
      .filter((row) => row.includes('"' + dupId + '"')).length;
    if (rows !== 1) errors.push("the archive holds " + dupId + " " + rows + " times");
    if (loadSparks(dir3).items.length !== 1) {
      errors.push("a spark the archive already held stayed in the live file");
    }

    // The open spark is still open, still on the clock, and still refuses a
    // close at the grace sitting, after a rotation.
    const env = { ...process.env, SPARK_ROOT: dir3 };
    const refusal = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "close"], {
      encoding: "utf8",
      env,
    });
    if (refusal.status === 0) {
      errors.push("rotate made close accept an open spark at its grace sitting");
    }
  } finally {
    rmSync(dir3, { recursive: true, force: true });
  }

  // (c) Two productive rotations with a close between. The first moves the
  // closed rows out, a spark closes, the second moves that one too: both move
  // rows, which a rotation with nothing closed cannot do. The archive holds
  // every id exactly once, and no position — the second rotation numbers the
  // list the first left, so a slot written by the first (S02 at 1) would name
  // another row in the second (S14 at 1). That is what retired the slot claim.
  const dir4 = mkdtempSync(join(tmpdir(), "grok-spark4-"));
  try {
    const rel4 = ARCHIVE_DIR + "/2026-09.md";
    const rowsOf = () =>
      readFileSync(join(dir4, rel4), "utf8")
        .split(NL)
        .filter((row) => row.startsWith("{"))
        .map((row) => JSON.parse(row));
    const idsUnique = (label) => {
      const ids = rowsOf().map((r) => r.id);
      if (new Set(ids).size !== ids.length) {
        errors.push("the archive holds a duplicate id after " + label + ": " + ids.join(", "));
      }
    };
    const spark = (id, status, extra) => ({
      id,
      kind: "trap",
      claim: "Fixture " + id + " is one sentence long.",
      object: "factory/tools/spark.mjs",
      whyNotLaw: "fixture, no check yet",
      status,
      openedOn: 1,
      ...extra,
    });
    writeFixture(
      dir4,
      {
        sitting: 5,
        note: "Look, not law. Absorb or drop next sitting.",
        items: [
          spark("S01", "open", { openedOn: 4 }),
          spark("S02", "absorbed", { absorbedAs: "T97" }),
          spark("S14", "open", { openedOn: 3 }),
          spark("S03", "dropped", { because: "fixture" }),
        ],
      },
      null,
    );
    const one = rotate(dir4, { now: new Date("2026-09-20T00:00:00Z") });
    if (one.moved !== 2) {
      errors.push("the first of two productive rotations moved " + one.moved + " rows, not 2");
    }
    cmdSetStatus(dir4, "S14", "absorbed", { absorbedAs: "T96" });
    const two = rotate(dir4, { now: new Date("2026-09-20T00:00:00Z") });
    if (two.moved !== 1) {
      errors.push("the second of two productive rotations moved " + two.moved + " rows, not 1");
    }
    idsUnique("the second rotation");
    // A row the archive already holds, back in the live file, is not written a
    // second time (T65).
    const back4 = loadSparks(dir4);
    back4.items.push(spark("S02", "absorbed", { absorbedAs: "T97" }));
    saveSparks(dir4, back4);
    const three = rotate(dir4, { now: new Date("2026-09-20T00:00:00Z") });
    if (three.moved !== 0) errors.push("rotate appended a spark the archive already held");
    idsUnique("a row already in the archive came back");
  } finally {
    rmSync(dir4, { recursive: true, force: true });
  }

  // Spawn-based never-move and second-close, so process.exit is observed.
  const dir2 = mkdtempSync(join(tmpdir(), "grok-spark2-"));
  try {
    writeFixture(
      dir2,
      {
        sitting: 1,
        note: "Look, not law. Absorb or drop next sitting.",
        items: [
          {
            id: "S01",
            kind: "lesson",
            claim: "A wall-clock is not a control-plane fuse.",
            object: "factory/sessions.json",
            whyNotLaw: "named decay signs already cover rot",
            status: "open",
            openedOn: 1,
          },
        ],
      },
      null,
    );
    const env = { ...process.env, SPARK_ROOT: dir2 };
    const script = fileURLToPath(import.meta.url);
    const addNm = spawnSync(
      process.execPath,
      [
        script,
        "add",
        "--kind",
        "trap",
        "--claim",
        "Weaken AGENTS.md never-move §5 for debug.",
        "--object",
        "AGENTS.md §5",
        "--why",
        "session only",
      ],
      { encoding: "utf8", env },
    );
    if (addNm.status === 0) errors.push("never-move add exited 0");

    const close1 = spawnSync(process.execPath, [script, "close"], { encoding: "utf8", env });
    if (close1.status !== 0) {
      errors.push("first close should pass: " + (close1.stderr || close1.stdout));
    }
    const close2 = spawnSync(process.execPath, [script, "close"], { encoding: "utf8", env });
    if (close2.status === 0) errors.push("second close with open spark exited 0");
  } finally {
    rmSync(dir2, { recursive: true, force: true });
  }

  if (errors.length) fail("spark self-test failed", errors);
  console.log("spark self-test ok");
}

const SPARK_ROOT = process.env.SPARK_ROOT || kitRoot;
const argv = process.argv.slice(2);
const cmd = argv[0];
const { flags, rest } = parseFlags(argv.slice(1));

if (cmd === "--self-test") selfTest();
else if (cmd === "check") {
  const errors = check(SPARK_ROOT);
  if (errors.length) fail("spark check failed", errors);
  console.log("spark check ok");
} else if (cmd === "add") cmdAdd(SPARK_ROOT, flags);
else if (cmd === "drop") {
  const id = rest[0];
  if (!id || !flags.because) fail("usage", ["spark.mjs drop S01 --because \"...\""]);
  cmdSetStatus(SPARK_ROOT, id, "dropped", { because: String(flags.because) });
} else if (cmd === "absorb") {
  const id = rest[0];
  const as = flags.as;
  if (!id || !as) fail("usage", ["spark.mjs absorb S01 --as T41"]);
  cmdSetStatus(SPARK_ROOT, id, "absorbed", { absorbedAs: String(as) });
} else if (cmd === "look") cmdLook(SPARK_ROOT);
else if (cmd === "rotate") {
  const r = rotate(SPARK_ROOT);
  console.log("moved " + r.moved + "  kept " + r.kept);
  for (const f of r.files) console.log("  " + f);
} else if (cmd === "close") cmdClose(SPARK_ROOT);
else {
  console.error(
    "usage: node factory/tools/spark.mjs add|drop|absorb|look|close|rotate|check|--self-test",
  );
  process.exit(1);
}
