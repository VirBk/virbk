#!/usr/bin/env node
// Writer seat helper. Prints a recipe or cuts a worktree from live main.
//
//   node factory/tools/seat.mjs list
//   node factory/tools/seat.mjs recipe qwen-code
//   node factory/tools/seat.mjs recipe aider
//   node factory/tools/seat.mjs recipe opencode
//   node factory/tools/seat.mjs recipe goose
//   node factory/tools/seat.mjs recipe deepseek-openai
//   node factory/tools/seat.mjs recipe claude-code
//   node factory/tools/seat.mjs recipe local-hands
//   node factory/tools/seat.mjs recipe cloud-grok
//   node factory/tools/seat.mjs recipe cloud-git-bus
//   node factory/tools/seat.mjs recipe cursor-desktop
//   node factory/tools/seat.mjs recipe pc-token
//   node factory/tools/seat.mjs recipe pc-dashscope
//   node factory/tools/seat.mjs recipe cloud-dashscope
//   node factory/tools/seat.mjs recipe help-fork
//   node factory/tools/seat.mjs recipe help-collab
//   node factory/tools/seat.mjs worktree --lane F4 --base <sha>
//   node factory/tools/seat.mjs disjoint <LANE> <LANE>
//   node factory/tools/seat.mjs census
//   node factory/tools/seat.mjs store [--store <path>]
//
// Does not call a model. Does not read API keys. The recipe is the launch.
//
// The recipe is the launch, so it names EVERYTHING that reaches the seat, not
// only the packet: the harness also injects the memory store, which lives
// outside git, in no packet, under no size budget and in no gate, so nothing
// in this repository can tell a successor it is there (D-72). The launch says
// so and points at `store`, which reads the store in the same act as it prints
// it (T04) and names an absent store as a zero rather than staying silent (P2).
//
// A recipe hands the packet over on stdin, never as one argv string: a
// cap-sized packet is over the Windows command-line limit and the harness
// dies before it reads a byte (T72). Windows lines read a key from the store
// that owns it in the same act as the launch, not from the shell that happens
// to be open (T73).
//
// `disjoint` reads two lanes' holds from factory/board.json — the same file
// the board is generated from (T04). `census` reads the process table, not a
// scheduler file, and takes its lister as an argument so a fixture can drive
// it. Either command accepts `--root <tree>`.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// The hosted map, the dropped list and the dropped-id scan are route.mjs's,
// imported rather than copied (T29, T75, D-67). route.mjs's commands are
// behind an entry guard, so importing it runs no CLI and probes no network.
import { HOSTED_IDS, hostedModel, droppedIds, droppedAudit, catalogIds } from "./route.mjs";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);

// ---- the store: what reaches a seat from outside the repository (D-72) ----
//
// The harness injects the memory store ahead of the packet. It is in no
// packet, under no size budget and in no gate, so nothing in this repository
// can tell a successor it is there; the launch names it instead. The numbers
// below are read from the store in the same act as they are printed (T04),
// never carried: a hardcoded count agrees with itself and with nothing on the
// disk. Nothing here reads, copies or prints the CONTENT of a store file —
// name, size and count only.
//
// The baseline is a STATED number, not a threshold. It is what the store held
// when D-72 ruled, re-read on 2026-09-22. Printing the total beside it makes
// drift visible to the next successor and buys nothing else: this command
// always exits 0, and its own line says it is a report rather than implying a
// check that is not there (T82, P4). An absent store is a named zero, because
// the absent case is the one that runs on every machine that is not this one
// (F49, P2).
const STORE_BASELINE = { bytes: 7292, files: 5, at: "2026-09-22", decision: "D-72" };

// Windows keeps the home directory in USERPROFILE and the bash family keeps it
// in HOME; a machine with neither has no store, which is the named zero below
// rather than a crash.
export function memoryStorePath() {
  const home =
    process.platform === "win32"
      ? process.env.USERPROFILE || process.env.HOME
      : process.env.HOME || process.env.USERPROFILE;
  return home ? join(home, ".qwen", "memories") : null;
}

// A deterministic walk, so two runs over one store print the same lines in the
// same order. An unreadable entry counts at zero rather than throwing: a
// launch must not fail on a machine whose store it cannot read.
function walkStore(dir, rel = "", out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = join(dir, e.name);
    const name = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walkStore(full, name, out);
    else {
      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        size = 0;
      }
      out.push({ rel: name, size });
    }
  }
  return out;
}

function signed(n) {
  return (n >= 0 ? "+" : "") + n;
}

export function storeReport(dir) {
  const out = ["store: " + (dir || "(none - no home directory; set USERPROFILE or HOME)")];
  let files = [];
  if (dir && existsSync(dir)) {
    files = walkStore(dir);
    const bytes = files.reduce((a, f) => a + f.size, 0);
    out.push("  files " + files.length + "  bytes " + bytes);
    for (const f of files) out.push("  " + f.rel + " " + f.size);
    if (!files.length) out.push("  empty - looked and found none");
  } else {
    out.push("  absent - looked and found none (0 files, 0 bytes)");
  }
  const bytes = files.reduce((a, f) => a + f.size, 0);
  out.push(
    "  baseline " + STORE_BASELINE.bytes + " bytes over " + STORE_BASELINE.files + " files (" +
      STORE_BASELINE.decision + ", " + STORE_BASELINE.at + ") - drift " +
      signed(bytes - STORE_BASELINE.bytes) + " bytes, " + signed(files.length - STORE_BASELINE.files) +
      " files; reported, not gated",
  );
  return out;
}

// `--root <tree>` points a command at a tree other than this one, and
// `--store <path>` points the store report at a store other than this
// machine's; that is how a fixture drives a proof. Parsed out before dispatch,
// so either order works and a caller that gets the usage branch cannot tell a
// typo from a failure.
function parseArgs(argv) {
  const rest = [];
  let root = kitRoot;
  let store = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1]) {
      root = resolve(argv[i + 1]);
      i++;
      continue;
    }
    if (argv[i] === "--store" && argv[i + 1]) {
      store = resolve(argv[i + 1]);
      i++;
      continue;
    }
    rest.push(argv[i]);
  }
  return { root, rest, store };
}

const { root, rest, store } = parseArgs(process.argv.slice(2));

const writerModel = JSON.parse(readFileSync(join(kitRoot, "factory", "project.json"), "utf8")).writerModel;

// Native catalog ids are not DashScope API ids. The map is route.mjs's, the
// one copy in this kit, and this file reads it instead of keeping a second
// (T29, T75). Hosted recipes print the map's answer for the live pick.
const hosted = hostedModel(writerModel);

// The DashScope base is factory/writer-paths.json bases.dashscope, read from
// the tree this file was pointed at, never copied into a recipe (T75). The
// `--root` tree supplies it so a fixture can render a recipe against its own
// spec: a hardcode renders the same text as a read in the tree this kit ships
// in, so the only way to tell them apart is to change the file and look again.
function dashscopeBaseOf(tree) {
  for (const t of [tree, kitRoot]) {
    try {
      const bases = JSON.parse(readFileSync(join(t, "factory", "writer-paths.json"), "utf8")).bases;
      if (bases && bases.dashscope) return String(bases.dashscope);
    } catch {
      // fall through to the next tree
    }
  }
  return "";
}
const dashscopeBase = dashscopeBaseOf(root);

// The launch names everything that reaches the seat, not only the packet. The
// harness also injects the memory store, and that part is invisible from here:
// outside git, in no packet, under no size budget, in no gate. So the launch
// names it and points at the command that measures it. The command is named
// rather than the numbers, because a number copied into the recipe would be
// carried rather than read (T04), and the store reaches the seat before the
// packet does, so these lines come first.
function storeStdin() {
  return [
    "# Before the packet: the harness also injects the memory store, at",
    "# ~/.qwen/memories. It is outside git, in no packet, under no size budget and",
    "# in no gate, so nothing in this repository can tell a successor it is there",
    "# (D-72). Run this and read what it prints — the path, the file count, the",
    "# total bytes and each file with its size, read from the store in the same",
    "# act, and a named zero when a machine has no store.",
    "#   node factory/tools/seat.mjs store",
  ].join(NL);
}

// The reading path is the packet, handed to the seat on stdin. A cap-sized
// packet as one argv string is over the Windows command-line limit, and the
// shell dies with "Argument list too long" before the harness runs (T72).
// One function so every recipe carries the same carrier, and the self-test
// renders the recipe instead of trusting this text.
function launchStdin(harness) {
  return [
    storeStdin(),
    "# Reading path is the packet, handed over on stdin, never as one argv",
    "# string. An argv form is over the Windows command-line limit and the",
    "# harness never runs (T72).",
    "#   node factory/tools/packet.mjs seat <LANE> > packet.txt",
    "#   " + harness + " < packet.txt",
  ].join(NL);
}

// A print-mode seat has no terminal to approve at, so the line that launches
// it must either name the harness's own auto-approve option or say plainly
// that the option was not verified here. Only qwen's option was read off its
// own help output on this machine; the rest are named gaps, because a guessed
// option fails silently, at the moment a seat needs it, which is exactly how
// the qwen-code line failed before it named --approval-mode (T07). Spelled
// once, so the recipes and the check that reads them cannot drift apart.
const UNVERIFIED_APPROVAL =
  "# A print-mode launch needs the harness's own auto-approve option. UNVERIFIED here: confirm it from that harness's own help output before launching.";

const RECIPES = {
  "qwen-code": (m) => `# Writer seat — Qwen Code.
# Control plane stays Grok (or Claude desktop). Do not remap the CP session.

export OPENAI_BASE_URL="\${OPENAI_BASE_URL:-${dashscopeBase}}"
export OPENAI_API_KEY="\${OPENAI_API_KEY:-\${DASHSCOPE_API_KEY}}"

# Hosted on DashScope. The base is factory/writer-paths.json bases.dashscope,
# read here and never copied into this recipe (T75).
# Linux/Mac:
#   export OPENAI_BASE_URL="${dashscopeBase}"
#   export OPENAI_API_KEY="\${DASHSCOPE_API_KEY}"
#   qwen --auth-type openai --model ${m}
# Windows:
#   $env:OPENAI_BASE_URL="${dashscopeBase}"
#   $env:OPENAI_API_KEY=[Environment]::GetEnvironmentVariable("DASHSCOPE_API_KEY","User")
#   qwen --auth-type openai --model ${m}
#
# --approval-mode yolo: the option and its choices (plan, default, auto-edit,
# auto, yolo) are read off "qwen --help" on this machine. The documented
# default requires approval for file edits or shell commands, and a print-mode
# seat has no terminal to approve at.
${launchStdin("qwen --auth-type openai --model <id> --approval-mode yolo -p -")}
# Print-mode. Poll long jobs in the foreground.
`,
  aider: (m) => `# Writer seat — Aider. Git-native. OpenAI-compat.
# Control plane stays Grok. Do not remap the CP session.

# DashScope hosted. The base is factory/writer-paths.json bases.dashscope, read
# here and never copied into this recipe (T75).
#   export OPENAI_API_BASE="${dashscopeBase}"
#   export OPENAI_API_KEY="\${DASHSCOPE_API_KEY}"
#   aider --model openai/${m}
#
# DeepSeek native:
#   export OPENAI_API_BASE="https://api.deepseek.com/v1"
#   export OPENAI_API_KEY="\${DEEPSEEK_API_KEY}"
#   aider --model deepseek/deepseek-chat
#
${launchStdin("aider --model openai/" + m)}
${UNVERIFIED_APPROVAL}
# Print-mode. Worktree only.
`,
  opencode: `# Writer seat — OpenCode. Multi-model local harness.
# Point it at Qwen local or DeepSeek. Control plane stays Grok.

#   opencode run --model <the project.json writerModel>
#
${launchStdin("opencode run --model <the project.json writerModel>")}
${UNVERIFIED_APPROVAL}
# Worktree only. Print-mode.
`,
  goose: `# Writer seat — Goose recipes. Local.
# Control plane stays Grok. Writer is the recipe, not the CP chat.

#   goose run --recipe <file> --path .
${UNVERIFIED_APPROVAL}
# Worktree only. Print-mode. Poll in the foreground.
`,
  "deepseek-openai": `# Writer seat — DeepSeek through any OpenAI-compat client.
# Not Claude Code. Control plane stays Grok.

export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export OPENAI_API_KEY="\${DEEPSEEK_API_KEY}"
export OPENAI_MODEL="deepseek-chat"

# Sweep: deepseek-flash. Keystone writer: deepseek-v4-pro.
${UNVERIFIED_APPROVAL}
# Print-mode. Envelope on stdin. Worktree only.
`,
  "claude-code": `# Writer seat — DeepSeek through the Claude Code harness.
# Optional. Control plane stays on Anthropic in a different terminal,
# or on Grok in the browser. Never this process.

export ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
export ANTHROPIC_API_KEY="\${DEEPSEEK_API_KEY}"
export ANTHROPIC_MODEL="deepseek-flash"
export ANTHROPIC_SMALL_FAST_MODEL="deepseek-flash"
export ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek-v4-pro"
export ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek-flash"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek-flash"
export CLAUDE_CODE_SUBAGENT_MODEL="deepseek-flash"

# Cut the worktree from live main, then start Claude Code in that tree.
${UNVERIFIED_APPROVAL}
# Paste the envelope. Print-mode. Poll long jobs in the foreground.
`,
  "local-hands": `# Local path. Grok judges. hands.mjs runs git. Writer is the PM pick.

# 1. node factory/tools/hands.mjs check
# 2. git ls-remote origin refs/heads/main
# 3. node factory/tools/hands.mjs isolate --lane <ID> --base <sha>
# 4. node factory/tools/hands.mjs recipe
# 5. writer pushes the branch only
# 6. Grok reviews in a fresh session, lands, restamps
#
${launchStdin("<writer harness>")}
${UNVERIFIED_APPROVAL}
# Prefix: the packet is the byte-stable prefix. Paste cache hits.
`,
  "cloud-grok": `# Cloud path when the autobuild PC is off.
# Grok issues and reviews. Writer is aider on a Codespace with DeepSeek/Qwen.

# 1. Owner places DEEPSEEK_API_KEY (or DASHSCOPE_API_KEY) as a Codespaces secret once.
# 2. git ls-remote origin refs/heads/main
# 3. node factory/tools/hands.mjs isolate --lane <ID> --base <sha>
#    prints: gh codespace create ... && gh codespace ssh ... recipe
# 4. Writer in that terminal. Push the branch only.
# 5. Grok reviews, lands, restamps.
#
# Do not remap this Grok session onto DeepSeek or Qwen.
# Do not add a GitHub Action until the secret exists.
#
${launchStdin("aider --model deepseek/deepseek-chat")}
${UNVERIFIED_APPROVAL}
# Prefix: the packet. Set x-grok-conv-id only on Grok API. Paste cache hits.
`,
  "cloud-git-bus": `# Cloud CP, local autobuild host still on.
# Grok writes the envelope blob. This PC fetches and runs the same harness as local-hands.

# On the machine that already autobuilds:
#   node factory/tools/hands.mjs watch
#   node factory/tools/hands.mjs isolate --lane <ID> --base <sha>
#   node factory/tools/hands.mjs recipe
#
${launchStdin("<writer harness>")}
${UNVERIFIED_APPROVAL}
# Writer pushes the branch only. Grok reviews and lands.
`,
  "git-bus": `# See cloud-git-bus. isolate git-bus is the pick; this recipe is the PC side.
`,
  "codespace": `# See cloud-grok. isolate codespace is the pick.
`,
  "cursor-desktop": `# Optional local harness. Not a cloud writer.
# Cursor Chat/Agent may override OpenAI base URL to api.deepseek.com (no /v1) or Qwen.
# Cursor Cloud Agents, background agents, automations, and CLI cannot take that token.
# Do not install Cursor to emulate the factory. Control plane stays Grok.
`,
  "pc-token": `# No Claude Code. Grok judges. This PC runs hands. Token is DeepSeek.

# 1. git, node, python3. pipx install aider-chat
# 2. export DEEPSEEK_API_KEY=...   # never git, never VITE_
# 3. node factory/tools/hands.mjs apply-topology pc-token
# 4. git ls-remote origin refs/heads/main
# 5. node factory/tools/hands.mjs isolate --lane <ID> --base <sha>
# 6. node factory/tools/hands.mjs recipe
#    OPENAI_API_BASE=https://api.deepseek.com/v1
#    aider --model deepseek/deepseek-chat
# 7. Writer pushes the branch only. Grok reviews and lands.
#
${launchStdin("aider --model deepseek/deepseek-chat")}
${UNVERIFIED_APPROVAL}
# Prefix is the packet. Paste cache hits.
`,
  "pc-dashscope": (m) => `# No Claude Code. Grok judges. This PC runs hands. Token is DashScope.

# 1. git, node. Install qwen-code.
# 2. export DASHSCOPE_API_KEY=... (never git, never VITE_)
# 3. node factory/tools/hands.mjs apply-topology pc-dashscope
# 4. isolate, then:
# Linux/Mac:
#    OPENAI_BASE_URL=${dashscopeBase}
#    qwen --auth-type openai --model ${m}
# Windows:
#    $env:OPENAI_BASE_URL="${dashscopeBase}"
#    $env:OPENAI_API_KEY=[Environment]::GetEnvironmentVariable("DASHSCOPE_API_KEY","User")
#    qwen --auth-type openai --model ${m}
#
${launchStdin("qwen --auth-type openai --model " + m + " --approval-mode yolo")}
# 5. Writer pushes the branch only. Grok reviews and lands.
`,
  "cloud-dashscope": (m) => `# No Claude Code. Autobuild PC is off. Token is DashScope.

# 1. Place DASHSCOPE_API_KEY as a Codespaces secret once.
# 2. node factory/tools/hands.mjs apply-topology cloud-dashscope
# 3. isolate prints gh codespace create. Recipe is qwen-code hosted.
#    OPENAI_BASE_URL=${dashscopeBase}
#    qwen --auth-type openai --model ${m}
#
${launchStdin("qwen --auth-type openai --model " + m + " --approval-mode yolo")}
# 4. Writer pushes the branch only. Grok reviews and lands.
# Do not add a GitHub Action until the secret exists.
`,
  "help-fork": `# Sidecar factory. This repo is not the product. Target is factory/help.json.
# Example: help Virbos. Virbos stays alumni. Do not overlay factory/ onto it.

# 1. Copy this kit into a new empty remote. Never VirBk/virbk.
# 2. cp factory/help.example.json factory/help.json
#    set target to owner/repo (example VirBk/virbos)
# 3. node factory/tools/hands.mjs apply-topology help-fork
# 4. git ls-remote https://github.com/<target> refs/heads/main
# 5. node factory/tools/hands.mjs isolate --lane <ID> --base <target-sha>
#    prints fork + sibling clone. Not a second remote here.
# 6. Writer in that clone. Product files only. Push a branch. gh pr create --repo <target>
# 7. This factory never lands the target's main. Grok of this child reviews the sidecar record.
# Do not run this sitting as control plane of Grok and the target together.
`,
  "help-collab": `# Sidecar with invited write on the target. Target owner still lands main.

# 1. Copy the kit into a new empty remote. factory/help.json names owner/repo.
# 2. node factory/tools/hands.mjs apply-topology help-collab
# 3. isolate prints a sibling clone. Writer topic-branch on the target.
# 4. PR to the target. Product files only. Co-authored-by the target owner if that is the credit pick.
# Do not overlay alumni. Do not land the target's main from here.
`,
};

RECIPES["desktop-qwen"] = RECIPES["qwen-code"];
RECIPES["desktop-deepseek"] = RECIPES["claude-code"];

// Holds, read from the file the board is generated from, in the same act as
// the comparison (T04) — never from BOARD.md, which is generated from it.
// A lane's hold is one comma-separated string. `*` means every file, so it
// overlaps everything and is not a sibling at all.
export function holdFiles(board, lane) {
  const row = (board.lanes || []).find((l) => l.id === lane);
  if (!row || typeof row.hold !== "string") return null;
  return row.hold.split(",").map((s) => s.trim()).filter(Boolean);
}

// A glob and a path that the glob matches are an overlap. `*` matches a
// separator too: `factory/tools/*` and `factory/tools/seat.mjs` name one file,
// and a rule that let that pair through could not catch the overlap it exists
// for. So the comparison is per segment, not a string equality.
export function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.replace(/\*/g, "[^]*").replace(/\?/g, "[^]") + "$");
}
function matchesGlob(glob, path) {
  return globToRegExp(glob).test(path);
}
export function holdsOverlap(a, b) {
  if (a === "*" || b === "*") return true;
  return matchesGlob(a, b) || matchesGlob(b, a);
}
export function overlapsOf(left, right) {
  const out = [];
  for (const a of left) {
    for (const b of right) {
      if (holdsOverlap(a, b)) out.push(a === b ? a : a + " <-> " + b);
    }
  }
  return out;
}

function readBoard(tree) {
  const file = join(tree, "factory", "board.json");
  if (!existsSync(file)) return { board: null, why: "no factory/board.json under " + tree };
  try {
    return { board: JSON.parse(readFileSync(file, "utf8")), why: "" };
  } catch (err) {
    return { board: null, why: "factory/board.json does not parse: " + String(err.message || err) };
  }
}

// Exit 0 only when no file is named by both. A lane that names no hold — off
// the board, or with an empty hold — is not a proven pair: an empty set
// overlaps nothing and would pass a weaker rule, so it exits non-zero naming
// what could not be read.
export function disjointReport(tree, a, b) {
  const { board, why } = readBoard(tree);
  if (!board) return { status: 1, lines: ["disjoint: " + why] };
  const left = holdFiles(board, a);
  const right = holdFiles(board, b);
  if (!left || !left.length) {
    return { status: 1, lines: ["disjoint: lane " + a + " names no hold on the board, so the pair is not proved"] };
  }
  if (!right || !right.length) {
    return { status: 1, lines: ["disjoint: lane " + b + " names no hold on the board, so the pair is not proved"] };
  }
  const overlap = overlapsOf(left, right);
  if (overlap.length) return { status: 1, lines: ["overlap " + a + " / " + b + ": " + overlap.join(", ")] };
  return {
    status: 0,
    lines: ["disjoint " + a + " / " + b + ": " + left.length + " and " + right.length + " holds, none shared"],
  };
}

// A seat census comes from the process table. The lister is injected on the
// command line so a fixture can drive it, and it is the only source: census
// reads no file. A lister prints one process per line: its pid, its parent
// pid, then the command line. The parent pid is what folds one launch's
// process tree into one seat.
const SEAT_ROW = /^\s*(\d+)\s+(\d+)\s+(.*)$/;
// A harness token is a bare word or a path segment (`\qwen-code\cli.js`,
// `goose run`, `aider --model ...`). A path that merely contains a harness
// directory name reads as that harness; the census is a listing of what the
// platform reports, not a proof that the lane on it is running. It is applied
// to the program a row runs, never to the whole command line: a harness token
// later in the line is a mention, not a seat (S17).
const SEAT_HARNESS = /(?:^|[\s\\/"'])(qwen|aider|goose|opencode)(?![A-Za-z0-9])/i;
// The program a row runs is its first token, or the token after an
// interpreter (`node C:/tools/goose/run.py`, `python3 .../aider`).
const SEAT_INTERPRETERS = new Set(["node", "node.exe", "python", "python3", "py"]);

function listerError(r) {
  return "census: the lister failed (" + (r.error ? String(r.error.message || r.error) : "exit " + r.status) + ")";
}

// The entry point passes the platform command, so the rows above are always
// the platform's own process listing and never a file this tool wrote.
function platformLister() {
  if (process.platform === "win32") {
    return {
      command: "powershell",
      args: [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId) $($_.CommandLine)\" }",
      ],
    };
  }
  return { command: "ps", args: ["-eo", "pid=,ppid=,args="] };
}

// Split on whitespace, but keep a quoted path together: an executable under
// "C:\Program Files" is one argument, not two.
function commandLister(command) {
  const parts = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(command))) parts.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  return { command: parts[0], args: parts.slice(1) };
}

function runLister(spec) {
  return spawnSync(spec.command, spec.args || [], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const cmd = rest[0] || "list";

if (cmd === "list") {
  console.log("seat recipes");
  for (const id of Object.keys(RECIPES)) console.log("  " + id);
  console.log("worktree --lane <id> --base <sha>");
  console.log("disjoint <LANE> <LANE>");
  console.log("census [--lister <command>]");
  console.log("store [--store <path>]");
  process.exit(0);
}

if (cmd === "store") {
  // Reads the store in the same act as it prints it (T04), names an absent one
  // as a zero (P2), and always exits 0: the drift line is a report, not a gate
  // (T82, P4). `--store` points it at a store other than this machine's, which
  // is how a fixture drives a proof on a machine whose store it must not read.
  process.stdout.write(storeReport(store || memoryStorePath()).join(NL) + NL);
  process.exit(0);
}

if (cmd === "recipe") {
  const id = rest[1];
  const entry = id ? RECIPES[id] : null;
  if (!entry) {
    console.error("unknown recipe. try: " + Object.keys(RECIPES).join(", "));
    process.exit(1);
  }
  const body = typeof entry === "function" ? entry(hosted) : entry;
  process.stdout.write(body);
  process.exit(0);
}

if (cmd === "worktree") {
  const laneIdx = rest.indexOf("--lane");
  const baseIdx = rest.indexOf("--base");
  const lane = laneIdx >= 0 ? rest[laneIdx + 1] : "";
  const base = baseIdx >= 0 ? rest[baseIdx + 1] : "";
  if (!lane || !base) {
    console.error("usage: node factory/tools/seat.mjs worktree --lane F4 --base <sha>");
    process.exit(1);
  }
  const dest = resolve(kitRoot, "..", "grok-" + lane.toLowerCase());
  const r = spawnSync("git", ["worktree", "add", dest, base], {
    cwd: kitRoot,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || "worktree add failed\n");
    process.exit(r.status === null ? 1 : r.status);
  }
  console.log("worktree " + dest);
  process.exit(0);
}

if (cmd === "disjoint") {
  // Two lanes, or the verdict would answer about the first pair and silently
  // drop the rest — a green that covers one pair of three (S20).
  const lanes = rest.slice(1);
  if (lanes.length !== 2) {
    console.error(
      "disjoint: compares two lanes and was given " + lanes.length + (lanes.length ? ": " + lanes.join(", ") : " (none)"),
    );
    process.exit(1);
  }
  const report = disjointReport(root, lanes[0], lanes[1]);
  const out = report.status === 0 ? console.log : console.error;
  for (const line of report.lines) out(line);
  process.exit(report.status);
}

if (cmd === "census") {
  const listerIdx = rest.indexOf("--lister");
  const spec = listerIdx >= 0 && rest[listerIdx + 1] ? commandLister(rest[listerIdx + 1]) : platformLister();
  const r = runLister(spec);
  if (r.status !== 0) {
    console.error(listerError(r));
    process.exit(1);
  }
  // A row is a seat only where the harness token is the program being run:
  // the first token of the command line, or the first token after an
  // interpreter. A harness token anywhere later — `pip show aider-chat`, a
  // `-- qwen` tail — is a mention and is not counted (S17). The test lives
  // here, in the command a person types, so a mutation of it mutates the
  // object that ships (D-61).
  //
  // One launch is a process TREE, so a counted row is a seat only when no
  // other counted row is its ancestor (S22). The row that owns it is found by
  // walking parents, not by reading the immediate parent alone, because the
  // rows between them need not themselves be counted: a qwen launch measured
  // on this machine is a cli-entry wrapper, a `node --expose-gc cli.js` child
  // whose harness token is a mention rather than the program (T77), and the
  // conpty helper below it, whose OpenConsole.exe path carries a harness
  // directory name and so IS counted. Every row's parent is kept, counted or
  // not, so the seat is the nearest counted ancestor.
  const parentOf = new Map();
  const rows = [];
  for (const line of String(r.stdout == null ? "" : r.stdout).split(/\r?\n/)) {
    const row = SEAT_ROW.exec(line);
    if (!row) continue;
    const pid = Number(row[1]);
    const ppid = Number(row[2]);
    parentOf.set(pid, ppid);
    const argv = commandLister(row[3]);
    const first = (argv.command || "").split(/[\\/]/).pop().toLowerCase();
    const program = SEAT_INTERPRETERS.has(first) ? argv.args[0] || "" : argv.command || "";
    const m = SEAT_HARNESS.exec(program);
    if (!m) continue;
    rows.push({ pid, ppid, harness: m[1].toLowerCase(), cmd: line.trim() });
  }
  const counted = new Map(rows.map((row) => [row.pid, row]));
  // The machine gives neither a complete nor an acyclic chain. Windows stamps
  // ParentProcessId at creation and never clears it when the parent dies, and
  // Get-CimInstance does not enumerate atomically, so pid-reuse churn can leave
  // two counted rows that are each other's parent. A walk that folded each into
  // the other would print ZERO seats while seats exist — worse than the
  // over-count this lane fixes, because the two-writer ceiling and the
  // dead-seat resume read this number. A walk that returns to a pid it already
  // walked has found a cycle: it cannot pick a nearest ancestor, and the seat is
  // the counted row with the LOWEST pid in the cycle, so the choice is
  // deterministic and no row is erased.
  function seatOf(row) {
    const path = [];
    const seen = new Set();
    let pid = row.pid;
    let nearest = null;
    for (;;) {
      seen.add(pid);
      path.push(pid);
      if (pid !== row.pid && nearest === null) {
        const c = counted.get(pid);
        if (c) nearest = c;
      }
      const parent = parentOf.get(pid);
      if (parent === undefined) return nearest || row;
      if (seen.has(parent)) {
        const cycle = path.slice(path.indexOf(parent));
        let best = nearest || row;
        for (const p of cycle) {
          const c = counted.get(p);
          if (c && c.pid < best.pid) best = c;
        }
        return best;
      }
      pid = parent;
    }
  }
  const folded = new Map();
  const seats = [];
  // A counted row whose own parent is in no row cannot be attached to its
  // launch — the parent exited between the enumeration and the write. The gap
  // cannot be inferred, so the row is still counted; the census names the row
  // and the pid it could not reach, and the summary says the count may
  // over-report. An honest number with its uncertainty named beats a confident
  // wrong one.
  const broken = [];
  for (const row of rows) {
    const seat = seatOf(row);
    if (seat.pid === row.pid) seats.push(row);
    else folded.set(seat, (folded.get(seat) || 0) + 1);
    if (!parentOf.has(row.ppid)) broken.push(row);
  }
  console.log("seat census — " + (listerIdx >= 0 ? "injected" : process.platform) + " process listing");
  for (const seat of seats) {
    console.log("  " + seat.pid + "  " + seat.harness + "  " + seat.cmd + "  (folded " + (folded.get(seat) || 0) + ")");
  }
  for (const row of broken) {
    console.log("  " + row.pid + "  " + row.harness + "  chain broken: parent " + row.ppid + " is in no row");
  }
  console.log("  " + seats.length + " running writer seat(s)");
  if (broken.length) {
    console.log("  " + broken.length + " counted row(s) have a broken chain; the count may over-report");
  }
  process.exit(0);
}

if (cmd === "--self-test") {
  const failed = [];
  function want(label, got, exp) {
    const g = JSON.stringify(got);
    const e = JSON.stringify(exp);
    if (g !== e) failed.push(label + ": got " + g + " want " + e);
  }
  function ok(label, cond, detail) {
    if (!cond) failed.push(label + (detail && detail.filter(Boolean).length ? ": " + detail.filter(Boolean).join(" ") : ""));
  }

  // P5 — this file holds no model map of its own. `hosted` is route.mjs's
  // exported map read through the live pick, so an edit to route's map alone
  // moves this value with no edit here, and a local copy would only agree with
  // route's by hand until the first change to either (T29, T75, D-67).
  // route.mjs's commands are behind an entry guard, so this import runs no CLI.
  want("flash", hostedModel("deepseek-flash"), "deepseek-v4.1-flash");
  want("passthrough", hostedModel("deepseek-v4.1-flash"), "deepseek-v4.1-flash");
  want("hosted-is-not-route-s-map-for-the-live-pick", hosted, HOSTED_IDS[writerModel] || writerModel);
  const catalog = catalogIds();
  ok(
    "route's hosted map names an id the catalog does not offer",
    Object.values(HOSTED_IDS).every((v) => catalog.includes(v)),
    Object.values(HOSTED_IDS).filter((v) => !catalog.includes(v)),
  );
  ok(
    "a dropped id is back in route's hosted map",
    Object.keys(HOSTED_IDS).every((k) => catalog.includes(k)),
    Object.keys(HOSTED_IDS).filter((k) => !catalog.includes(k)),
  );

  // Everything below reads a RENDERED recipe, never the source text that
  // produced it. An assertion compared against the code that wrote it agrees
  // with its own bug (D-59).
  const rendered = {};
  for (const id of Object.keys(RECIPES)) {
    const entry = RECIPES[id];
    rendered[id] = typeof entry === "function" ? entry(hosted) : entry;
  }
  const linesOf = (text) => text.replace(/\r\n/g, NL).split(NL);
  function packetBlock(text) {
    const lines = linesOf(text);
    const start = lines.findIndex((l) => l.includes("packet.mjs"));
    if (start < 0) return "";
    const out = [lines[start]];
    for (let i = start + 1; i < lines.length && lines[i].startsWith("#"); i++) out.push(lines[i]);
    return out.join(NL);
  }
  const carrierLine = (id) => packetBlock(rendered[id]).split(NL).find((l) => l.includes("< packet.txt")) || "";

  // Item 1 — the packet reaches a seat on stdin, never as one argv string.
  const named = Object.keys(rendered).filter((id) => rendered[id].includes("packet.mjs"));
  ok("no rendered recipe names packet.mjs, so the carrier rule proves nothing", named.length >= 1);
  const argvForms = [];
  const carrierless = [];
  for (const id of named) {
    if (rendered[id].includes("$(")) argvForms.push(id);
    if (!carrierLine(id)) carrierless.push(id);
  }
  ok("a recipe hands the packet over as an argv substitution", argvForms.length === 0, argvForms);
  ok("a recipe names packet.mjs and prints no stdin carrier", carrierless.length === 0, carrierless);
  want("qwen-code carrier", carrierLine("qwen-code"), "#   qwen --auth-type openai --model <id> --approval-mode yolo -p - < packet.txt");
  // The aider carrier moves WITH the recipe: it is the live pick read through
  // route's map, so a dropped id put back into the recipe reds this line (P2).
  want("aider carrier", carrierLine("aider"), "#   aider --model openai/" + hosted + " < packet.txt");
  ok("the live hosted id reaches no rendered recipe", Object.values(rendered).some((t) => t.includes(hosted)));

  // P1/P3 (D-72) — the launch names the context that reaches a seat from
  // OUTSIDE this repository. The memory store is injected ahead of the packet
  // and is in no packet, under no budget and in no gate, so the launch is the
  // only place a successor can learn it is there. The launch names the command
  // that measures it; the numbers live in that command, read from the store in
  // the same act as they are printed (T04), because a number copied into the
  // recipe would be carried and a copied count agrees with itself and with
  // nothing on the disk. Every recipe that hands a seat a packet carries it,
  // read off the RENDERED text (D-59). The set the rule scans is the recipes
  // that render a stdin carrier — the act of handing the packet over — computed
  // here rather than borrowed from the carrier rule's `named`. Its guard then
  // asserts the store line over THAT set, so it reds when the store block
  // leaves every recipe while the carrier rule stays green: the old guard copied
  // the carrier guard's own condition and could not fail unless it did (D-61).
  const storeLine = (id) => linesOf(rendered[id]).find((l) => /\bseat\.mjs store\b/.test(l)) || "";
  const carrying = Object.keys(rendered).filter((id) => carrierLine(id));
  const storeless = carrying.filter((id) => !storeLine(id));
  ok(
    "a launch hands over a packet and never names the memory store that also reaches the seat",
    storeless.length === 0,
    storeless,
  );
  ok(
    "no recipe that hands over a packet names the memory store, so the store rule proves nothing",
    carrying.filter((id) => storeLine(id)).length >= 1,
    storeless,
  );
  want("qwen-code store line", storeLine("qwen-code"), "#   node factory/tools/seat.mjs store");

  // P2 — no dropped id survives in a RENDERED recipe (D-59), and the list
  // examined is factory/writer-paths.json's own, read here rather than written
  // out again (T29, T75). An empty list fails: a scan of nothing cannot be
  // told from a scan that never ran (F49).
  const dropped = droppedIds();
  want("the-dropped-list-is-empty-so-the-recipe-scan-proves-nothing", dropped.length > 0, true);
  const recipeAudit = droppedAudit(
    Object.keys(rendered).map((id) => ({ label: "recipe " + id, text: rendered[id] })),
    dropped,
  );
  want("a-rendered-recipe-carries-a-dropped-id", recipeAudit.status, "clean");
  if (recipeAudit.status !== "clean") for (const line of recipeAudit.lines) failed.push("  " + line);

  // P6 — no recipe hardcodes the DashScope base. Every dashscope URL a
  // RENDERED recipe carries is factory/writer-paths.json bases.dashscope, read
  // from the tree this file was pointed at (T75). A hardcode of that same URL
  // renders identical text here, so the seam case below changes that file and
  // renders the recipes again.
  const urlPattern = /https?:\/\/[^\s"'{}()<>\\]+/g;
  const strayBase = [];
  let baseHits = 0;
  for (const [id, text] of Object.entries(rendered)) {
    for (const url of text.match(urlPattern) || []) {
      if (!/dashscope|aliyuncs/i.test(url)) continue;
      baseHits++;
      if (url !== dashscopeBase) strayBase.push(id + " carries " + url);
    }
  }
  ok("a rendered recipe carries a dashscope base that is not the spec's", strayBase.length === 0, strayBase);
  ok("no rendered recipe carries a dashscope base, so this rule proves nothing", baseHits >= 5);

  // Item 5 — a print-mode recipe names a VERIFIED approval mode, or says that
  // harness's option was not verified here. A print-mode seat has no terminal
  // to approve at, and the recipe is the only thing a launcher reads, so a
  // recipe that names neither is a seat that reads its packet, does the
  // analysis, and writes nothing — which is what two seats launched from this
  // file's qwen-code line did before that line named --approval-mode.
  //
  // Scope is PRINT MODE, not the stdin carrier. Keying it on the carrier left
  // goose invisible: goose launches print mode and renders no carrier, so
  // deleting goose's note left this check green (D-62). A recipe marks itself
  // a print-mode launch in one of two ways — its own text says so, or it
  // hands the packet to a harness on stdin, which is that same launch by
  // another route. Both are read from the RENDERED recipe (T07, D-59). The
  // declaration is tested with the note stripped out, so a recipe is in scope
  // on its own line and deleting the note cannot also delete the recipe from
  // the rule: the marker can fail on its own. A recipe that marks neither is
  // a pointer to another recipe or an advisory, launches no seat, and has no
  // mode to state.
  const APPROVAL_MODE = /--approval-mode(\s+|=)\S/;
  const PRINT_MODE = /print-mode/i;
  const ownsPrintMode = (id) => PRINT_MODE.test(rendered[id].split(UNVERIFIED_APPROVAL).join(""));
  const printMode = Object.keys(rendered).filter((id) => ownsPrintMode(id) || carrierLine(id));
  ok("no rendered recipe marks a print-mode launch, so the approval rule proves nothing", printMode.length >= 1);
  const noMode = [];
  for (const id of printMode) {
    if (APPROVAL_MODE.test(carrierLine(id))) continue;
    if (rendered[id].includes(UNVERIFIED_APPROVAL)) continue;
    noMode.push(id);
  }
  ok("a print-mode recipe names no approval mode", noMode.length === 0, noMode);

  // Item 2 — a writer key is read from the store that owns it, in the same
  // act as the launch. A base URL is not a key; only *_API_KEY is held to it.
  const keyAssigns = [];
  const keyBad = [];
  const keyNameless = [];
  for (const text of Object.values(rendered)) {
    for (const line of linesOf(text)) {
      const m = /^\s*#?\s*\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || !/_API_KEY$/.test(m[1])) continue;
      keyAssigns.push(m[1]);
      const read = /^\[Environment\]::GetEnvironmentVariable\("([A-Za-z_][A-Za-z0-9_]*)",\s*"User"\)$/.exec(m[2]);
      if (!read) keyBad.push(line.trim());
      else if (!read[1]) keyNameless.push(m[1]);
    }
  }
  ok("no Windows line reads a writer key at all, so the key rule proves nothing", keyAssigns.length >= 1);
  ok("a Windows line takes the key from a bare $env:", keyBad.length === 0, keyBad);
  ok("a store read names no variable", keyNameless.length === 0, keyNameless);

  // Item 3 — disjoint holds, driven through the CLI a caller runs, against a
  // fixture board. A helper called directly would not see a mutant in the
  // exit path.
  const self = fileURLToPath(import.meta.url);
  const fixture = mkdtempSync(join(tmpdir(), "grok-f37-seat-"));
  const bare = mkdtempSync(join(tmpdir(), "grok-f37-bare-"));
  const baseTree = mkdtempSync(join(tmpdir(), "grok-f52-seat-base-"));
  const storeA = mkdtempSync(join(tmpdir(), "grok-f54-store-a-"));
  const storeB = mkdtempSync(join(tmpdir(), "grok-f54-store-b-"));
  // storeC is created and never written to: a store directory that is present
  // with zero files, the case one line from absent.
  const storeC = mkdtempSync(join(tmpdir(), "grok-f54-store-c-"));
  const runSeat = (args, tree) => spawnSync(process.execPath, [self, ...args, "--root", tree], { encoding: "utf8" });
  try {
    mkdirSync(join(fixture, "factory"), { recursive: true });
    writeFileSync(
      join(fixture, "factory", "board.json"),
      JSON.stringify({
        lanes: [
          { id: "F35", hold: "factory/tools/alumni.mjs, contracts/intake.v1.json" },
          { id: "F38", hold: "factory/tools/seatReturn.mjs, contracts/seat-return.v1.json" },
          { id: "F39", hold: "factory/tools/*, factory/traps.yaml" },
          { id: "F40", hold: "factory/traps.yaml, docs/log/f40.md" },
          { id: "F41", hold: "*" },
          { id: "F42", hold: "" },
        ],
      }),
    );
    // A scheduler file a reader could mistake for the census, carrying a pid
    // no lister reports. Nothing below may return it.
    writeFileSync(
      join(fixture, "factory", "sessions.json"),
      JSON.stringify({ seats: [{ pid: 4242, harness: "goose", cmd: "goose run --recipe decoy.json" }] }),
    );
    const dj = (a, b) => runSeat(["disjoint", a, b], fixture);
    const pass = dj("F35", "F38");
    ok("two lanes with no shared hold exited " + pass.status, pass.status === 0, [pass.stdout, pass.stderr]);
    const share = dj("F39", "F40");
    ok("two lanes sharing factory/traps.yaml read as disjoint", share.status !== 0, [share.stdout]);
    ok("the overlap is not named", share.stderr.includes("factory/traps.yaml"), [share.stderr]);
    const glob = dj("F39", "F35");
    ok("a glob and a path the glob matches read as disjoint", glob.status !== 0, [glob.stdout]);
    ok("the glob overlap is not named", glob.stderr.includes("factory/tools/*"), [glob.stderr]);
    const star = dj("F41", "F35");
    ok("* read as disjoint from a named path", star.status !== 0, [star.stdout]);
    const empty = dj("F42", "F35");
    ok("a lane with no holds read as a proven pair", empty.status !== 0, [empty.stdout]);
    const absent = dj("F99", "F35");
    ok("a lane missing from the board read as a proven pair", absent.status !== 0, [absent.stdout]);
    const noBoard = runSeat(["disjoint", "F35", "F38"], bare);
    ok("a tree with no board read as a proven pair", noBoard.status !== 0, [noBoard.stdout]);
    // Three lanes are not a pair. The verdicts above answer about two; a third
    // used to be dropped in silence and the exit was still 0.
    const three = runSeat(["disjoint", "F35", "F38", "F39"], fixture);
    ok("a three-lane call was answered as a pair", three.status !== 0, [three.stdout, three.stderr]);
    ok(
      "the refused three-lane call did not name all three lanes",
      ["F35", "F38", "F39"].every((id) => (three.stderr || "").includes(id)),
      [three.stderr],
    );

    // Item 4 — the census comes from the process table through the injected
    // lister, and a harness token is a seat only where it is the program the
    // row runs. Driven through the CLI, because the row rule lives in the CLI
    // block, which is the object that ships (D-61).
    const listing = [
      "8324 7001 \"C:\\node\\qwen-code\\cli.js\" -p -",
      "4521 7002 goose run --recipe factory/recipes/x.json",
      "17 7003 node C:/tools/goose/run.py --once",
      "9001 7004 pip show aider-chat",
      "9002 7005 powershell -NoProfile -Command Get-CimInstance Win32_Process -- qwen",
    ].join(NL);
    const listerFile = join(fixture, "lister.mjs");
    writeFileSync(listerFile, "process.stdout.write(" + JSON.stringify(listing) + ");" + NL);
    const cen = runSeat(["census", "--lister", '"' + process.execPath + '" "' + listerFile + '"'], fixture);
    ok("census through the CLI exited " + cen.status, cen.status === 0, [cen.stderr]);
    ok("a mention was counted as a seat", (cen.stdout || "").includes("3 running writer seat(s)"), [cen.stdout]);
    ok("the seat whose program is the qwen path was not reported", (cen.stdout || "").includes("8324"), [cen.stdout]);
    ok("the script after an interpreter was not reported", (cen.stdout || "").includes("C:/tools/goose/run.py"), [cen.stdout]);
    ok(
      "a harness named in an argument was reported as a seat",
      !(cen.stdout || "").includes("9001") && !(cen.stdout || "").includes("9002"),
      [cen.stdout],
    );
    ok("census reported a row no lister emitted", !(cen.stdout || "").includes("4242"), [cen.stdout]);
    // The harness label is the one field of a counted row that nothing above
    // reaches: a hardcoded label still gives the right count, the right pids
    // and the right exclusions. Read it off the CLI's own rendering, per pid.
    const label = {};
    for (const line of (cen.stdout || "").split(/\r?\n/)) {
      const m = /^\s*(\d+)\s+(\S+)\s/.exec(line);
      if (m) label[m[1]] = m[2];
    }
    ok(
      "a row's harness label was wrong",
      label["8324"] === "qwen" && label["4521"] === "goose" && label["17"] === "goose",
      [JSON.stringify(label)],
    );

    // Item 1 — one launch is one seat. The fixture is a real launch's shape,
    // measured on this machine: a cli-entry wrapper, two `--expose-gc` node
    // children whose harness token is a mention and so are not counted rows at
    // all, and the conpty helper under them, whose OpenConsole.exe path
    // carries a harness directory name and so IS counted. The seat and the
    // folded row are therefore separated by rows the census does not count,
    // which is why the owner is found by walking parents. The fixture's bytes
    // are written through JSON.stringify, so its backslashes survive: a
    // collapsed backslash here would corrupt the very rows under test.
    const censusOf = (name, text) => {
      const file = join(fixture, name);
      writeFileSync(file, "process.stdout.write(" + JSON.stringify(text) + ");" + NL);
      return runSeat(["census", "--lister", '"' + process.execPath + '" "' + file + '"'], fixture);
    };
    const oneLaunch = [
      "5000 900 node C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli-entry.js -p -",
      "5001 5000 node --expose-gc C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli.js -p -",
      "5002 5001 node --expose-gc C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli.js -p -",
      "5003 5002 C:\\npm\\node_modules\\@qwen-code\\qwen-code\\node_modules\\@lydell\\node-pty-win32-x64\\prebuilds\\win32-x64\\conpty\\OpenConsole.exe --headless --width 80",
      "5004 5002 powershell.exe -NoProfile -Command Add-Type -Namespace QwenCode",
    ].join(NL);
    const cenOne = censusOf("lister-one.mjs", oneLaunch);
    ok("one launch was counted as several seats", (cenOne.stdout || "").includes("1 running writer seat(s)"), [cenOne.stdout]);
    ok("the seat was not the launch's cli-entry wrapper", /^\s*5000\s+qwen\s/m.test(cenOne.stdout || ""), [cenOne.stdout]);
    ok("the counted helper below the wrapper was dropped instead of folded", /\(folded 1\)/.test(cenOne.stdout || ""), [cenOne.stdout]);
    ok(
      "a counted row from the same launch survived as its own seat",
      !/^\s*5003\s+\S+\s/m.test(cenOne.stdout || ""),
      [cenOne.stdout],
    );

    // Item 2 — folding does not swallow a second launch. Two launches whose
    // wrappers are not each other's parent, each with its own tree, are two
    // seats.
    const twoLaunches = [
      "6000 900 node C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli-entry.js -p -",
      "6001 6000 node --expose-gc C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli.js -p -",
      "6002 901 node C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli-entry.js -p -",
      "6003 6002 node --expose-gc C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli.js -p -",
    ].join(NL);
    const cenTwo = censusOf("lister-two.mjs", twoLaunches);
    ok("two seats were counted as one", (cenTwo.stdout || "").includes("2 running writer seat(s)"), [cenTwo.stdout]);
    ok(
      "an independent launch's wrapper was not reported as a seat",
      /^\s*6000\s+qwen\s/m.test(cenTwo.stdout || "") && /^\s*6002\s+qwen\s/m.test(cenTwo.stdout || ""),
      [cenTwo.stdout],
    );
    // Correction item 1 — a parent cycle never erases a seat. Two counted rows
    // whose pids are each other's parent is ordinary pid-reuse churn, and a walk
    // that folds each into the other prints ZERO seats while seats exist. The
    // seat is the lowest pid in the cycle, and the count is never below the
    // counted rows present.
    const cycle = [
      "8001 8002 C:\\npm\\node_modules\\@qwen-code\\qwen-code\\node_modules\\@lydell\\node-pty-win32-x64\\prebuilds\\win32-x64\\conpty\\OpenConsole.exe --headless --width 80",
      "8002 8001 C:\\npm\\node_modules\\@qwen-code\\qwen-code\\node_modules\\@lydell\\node-pty-win32-x64\\prebuilds\\win32-x64\\conpty\\OpenConsole.exe --headless --width 80",
    ].join(NL);
    const cenCycle = censusOf("lister-cycle.mjs", cycle);
    ok("a cycle erased every seat", /^\s*1 running writer seat\(s\)/m.test(cenCycle.stdout || ""), [cenCycle.stdout]);
    ok(
      "a cycle was not folded to its lowest-pid row",
      /^\s*8001\s+qwen[^\n]*\(folded 1\)/m.test(cenCycle.stdout || ""),
      [cenCycle.stdout],
    );
    const cycleSeats = Number((/^\s*(\d+) running writer seat\(s\)/m.exec(cenCycle.stdout || "") || [])[1]);
    ok("a cycle erased every seat: the count reached zero while counted rows exist", cycleSeats >= 1, [cenCycle.stdout]);

    // A self-parent row is a one-row cycle: one seat, no loop.
    const cenSelf = censusOf(
      "lister-self.mjs",
      "9000 9000 node C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli-entry.js -p -",
    );
    ok("a self-parent row was not one seat", /^\s*1 running writer seat\(s\)/m.test(cenSelf.stdout || ""), [cenSelf.stdout]);

    // Correction item 2 — a torn chain is reported, not silently counted as
    // another seat. The wrapper at 7000 has a listed parent; the conpty row at
    // 7002's own parent 7001 is in no row, so 7002 cannot be attached to 7000's
    // launch. The row still counts, and the census says why the count may
    // over-report rather than printing a confident wrong one.
    const torn = [
      "6999 6999 init",
      "7000 6999 node C:\\npm\\node_modules\\@qwen-code\\qwen-code\\cli-entry.js -p -",
      "7002 7001 C:\\npm\\node_modules\\@qwen-code\\qwen-code\\node_modules\\@lydell\\node-pty-win32-x64\\prebuilds\\win32-x64\\conpty\\OpenConsole.exe --headless --width 80",
    ].join(NL);
    const cenTorn = censusOf("lister-torn.mjs", torn);
    ok("the torn row was dropped instead of counted", /^\s*2 running writer seat\(s\)/m.test(cenTorn.stdout || ""), [cenTorn.stdout]);
    ok("a torn chain was not reported", /^\s*7002\s+\S+[^\n]*chain broken[^\n]*7001/m.test(cenTorn.stdout || ""), [cenTorn.stdout]);
    ok(
      "the summary did not say the count may over-report",
      /^\s*1 counted row\(s\) have a broken chain; the count may over-report/m.test(cenTorn.stdout || ""),
      [cenTorn.stdout],
    );

    const emptyLister = join(fixture, "empty-lister.mjs");
    writeFileSync(emptyLister, "process.stdout.write('');" + NL);
    const cenEmpty = runSeat(["census", "--lister", '"' + process.execPath + '" "' + emptyLister + '"'], fixture);
    ok("an empty process listing reported a seat", (cenEmpty.stdout || "").includes("0 running writer seat(s)"), [cenEmpty.stdout]);

    // P6's second direction — a tree that owns a DIFFERENT bases.dashscope.
    // Every rendered recipe must follow it, and none may still carry this
    // kit's URL. A hardcode of the same string renders identically in the tree
    // this file ships in, so this is the only measurement that tells a read
    // from a copy (T75, D-59). Driven through the recipe verb a caller runs,
    // on the tree it was pointed at.
    mkdirSync(join(baseTree, "factory"), { recursive: true });
    const fixtureBase = "https://zzz-fixture.invalid/compatible-mode/v1";
    writeFileSync(
      join(baseTree, "factory", "writer-paths.json"),
      JSON.stringify({ bases: { dashscope: fixtureBase, native: "https://api.deepseek.com/v1" } }),
    );
    for (const id of ["qwen-code", "desktop-qwen", "aider", "pc-dashscope", "cloud-dashscope"]) {
      const r = runSeat(["recipe", id], baseTree);
      ok("recipe " + id + " exited " + r.status, r.status === 0, [r.stderr]);
      ok(
        "recipe " + id + " did not render its tree's own dashscope base",
        (r.stdout || "").includes(fixtureBase),
        [r.stdout],
      );
      ok(
        "recipe " + id + " still carries this kit's dashscope base",
        !(r.stdout || "").includes(dashscopeBase),
        [r.stdout],
      );
    }

    // P1/P3 — the store report reads the store in the same act as it prints it
    // (T04). Two fixtures with different contents, driven through the CLI a
    // person runs: one hardcoded count cannot answer both (D-59). Nothing here
    // reads, copies or prints a file's CONTENT — name, size and count only.
    writeFileSync(join(storeA, "alpha.md"), "x".repeat(120));
    writeFileSync(join(storeA, "beta.md"), "y".repeat(7));
    mkdirSync(join(storeA, "nested"), { recursive: true });
    writeFileSync(join(storeA, "nested", "gamma.md"), "z".repeat(5));
    writeFileSync(join(storeB, "only.md"), "q".repeat(41));
    const a = runSeat(["store", "--store", storeA], fixture);
    ok("store exited " + a.status, a.status === 0, [a.stderr]);
    const aOut = a.stdout || "";
    ok("the store report did not name the store's path", aOut.includes(storeA), [aOut]);
    ok("the store report did not read the store's count and bytes", /files 3\b/.test(aOut) && /bytes 132\b/.test(aOut), [aOut]);
    ok(
      "the store report did not name each file with its size",
      /alpha\.md 120\b/.test(aOut) && /beta\.md 7\b/.test(aOut) && /nested\/gamma\.md 5\b/.test(aOut),
      [aOut],
    );
    ok("the store report printed the CONTENTS of a store file", !aOut.includes("xxx"), [aOut]);
    const b = runSeat(["store", "--store", storeB], fixture);
    ok("store exited " + b.status, b.status === 0, [b.stderr]);
    const bOut = b.stdout || "";
    ok("a second store printed the first store's numbers", /files 1\b/.test(bOut) && /bytes 41\b/.test(bOut), [bOut]);
    ok("a second store reprinted the first store's file", !bOut.includes("alpha.md"), [bOut]);
    ok("the store report printed the CONTENTS of a store file", !bOut.includes("qqq"), [bOut]);

    // P2 — an absent store is a NAMED zero, not silence. A silent pass cannot
    // be told from a check that never ran (F49), and the absent case is the one
    // that runs on every machine that is not this one.
    const missing = runSeat(["store", "--store", join(fixture, "no-such-store")], fixture);
    ok("an absent store exited " + missing.status, missing.status === 0, [missing.stderr]);
    ok("an absent store was silent", /looked and found none/.test(missing.stdout || ""), [missing.stdout]);
    ok("an absent store did not report a zero", /\(0 files, 0 bytes\)/.test(missing.stdout || ""), [missing.stdout]);
    // P2 — an EMPTY store: the directory is present and holds zero files. It is
    // one line from the absent case in storeReport() and the two must stay
    // distinguishable, or "looked and found none" tells a reader nothing about
    // which of the two it was looking at.
    const emptyStore = runSeat(["store", "--store", storeC], fixture);
    ok("an empty store exited " + emptyStore.status, emptyStore.status === 0, [emptyStore.stderr]);
    const eOut = emptyStore.stdout || "";
    ok("an empty store was not reported as an empty store", /empty - looked and found none/.test(eOut), [eOut]);
    ok("an empty store did not report its count and bytes", /files 0\b/.test(eOut) && /bytes 0\b/.test(eOut), [eOut]);
    ok(
      "an empty store reads the same as an absent one",
      !/absent/.test(eOut) && !/\(0 files, 0 bytes\)/.test(eOut),
      [eOut],
    );
    // A machine with no home directory at all: no crash, and a named zero. The
    // case is driven in-process against the two functions the command calls,
    // because a child on Windows gets USERPROFILE handed back by the platform
    // whatever the env block says — a child fixture would measure the OS, not
    // this code. The functions called are the exported ones the gate's file
    // ships, not a copy (D-59).
    const keptEnv = {};
    for (const k of ["USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH"]) {
      keptEnv[k] = process.env[k];
      delete process.env[k];
    }
    try {
      want("no home directory names no store", memoryStorePath(), null);
      const nullStore = storeReport(memoryStorePath()).join(NL);
      ok(
        "a machine with no home directory was silent about the store",
        /no home directory/.test(nullStore) && /looked and found none/.test(nullStore),
        [nullStore],
      );
      ok("a machine with no home directory did not report a zero", /\(0 files, 0 bytes\)/.test(nullStore), [nullStore]);
    } finally {
      for (const [k, v] of Object.entries(keptEnv)) if (v !== undefined) process.env[k] = v;
    }

    // P4 — growth is visible and visibility is all it buys. The fixture store
    // is 7160 bytes and two files under the baseline, the command still exits
    // 0, and its own line says the number is a report rather than implying a
    // check that is not there (T82).
    ok("a store far under the baseline failed the command", a.status === 0, [a.stderr]);
    ok(
      "the report did not print the total against the stated baseline",
      /baseline 7292 bytes over 5 files/.test(aOut) && /drift -7160 bytes, -2 files/.test(aOut),
      [aOut],
    );
    ok("the drift line does not say it is a report and not a gate", /reported, not gated/.test(aOut), [aOut]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
    rmSync(baseTree, { recursive: true, force: true });
    rmSync(storeA, { recursive: true, force: true });
    rmSync(storeB, { recursive: true, force: true });
    rmSync(storeC, { recursive: true, force: true });
  }

  if (failed.length) {
    console.error("seat self-test failed");
    for (const f of failed) console.error("  " + f);
    process.exit(1);
  }
  console.log("seat self-test ok");
  process.exit(0);
}

console.error("usage: node factory/tools/seat.mjs list|recipe|worktree|disjoint|census|store|--self-test");
process.exit(1);
