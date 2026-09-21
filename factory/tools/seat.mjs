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
//
// Does not call a model. Does not read API keys. The recipe is the launch.
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

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NL = String.fromCharCode(10);

// `--root <tree>` points a command at a tree other than this one; that is how
// a fixture drives a proof. Parsed out before dispatch, so either order works
// and a caller that gets the usage branch cannot tell a typo from a failure.
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

const { root, rest } = parseArgs(process.argv.slice(2));

const writerModel = JSON.parse(readFileSync(join(kitRoot, "factory", "project.json"), "utf8")).writerModel;

// Native catalog ids are not DashScope API ids. Hosted recipes print the map.
const HOSTED = {
  "qwen3-coder": "qwen3-coder-plus",
  "deepseek-flash": "deepseek-v4.1-flash",
  "deepseek-v4-pro": "deepseek-v4-pro-0813",
};
function hostedModel(id) {
  return HOSTED[id] || id;
}
const hosted = hostedModel(writerModel);

// The reading path is the packet, handed to the seat on stdin. A cap-sized
// packet as one argv string is over the Windows command-line limit, and the
// shell dies with "Argument list too long" before the harness runs (T72).
// One function so every recipe carries the same carrier, and the self-test
// renders the recipe instead of trusting this text.
function packetStdin(harness) {
  return [
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

export OPENAI_BASE_URL="\${OPENAI_BASE_URL:-http://127.0.0.1:11434/v1}"
export OPENAI_API_KEY="\${OPENAI_API_KEY:-local}"

# Local:
#   ollama pull qwen3-coder
#   qwen --auth-type openai --model qwen3-coder
#
# Hosted instead:
# Linux/Mac:
#   export OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
#   export OPENAI_API_KEY="\${DASHSCOPE_API_KEY}"
#   qwen --auth-type openai --model ${m}
# Windows:
#   $env:OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
#   $env:OPENAI_API_KEY=[Environment]::GetEnvironmentVariable("DASHSCOPE_API_KEY","User")
#   qwen --auth-type openai --model ${m}
#
# --approval-mode yolo: the option and its choices (plan, default, auto-edit,
# auto, yolo) are read off "qwen --help" on this machine. The documented
# default requires approval for file edits or shell commands, and a print-mode
# seat has no terminal to approve at.
${packetStdin("qwen --auth-type openai --model <id> --approval-mode yolo -p -")}
# Print-mode. Poll long jobs in the foreground.
`,
  aider: `# Writer seat — Aider. Git-native. OpenAI-compat.
# Control plane stays Grok. Do not remap the CP session.

# Local Qwen:
#   export OPENAI_API_BASE="http://127.0.0.1:11434/v1"
#   export OPENAI_API_KEY="local"
#   aider --model ollama/qwen3-coder
#
# DeepSeek:
#   export OPENAI_API_BASE="https://api.deepseek.com/v1"
#   export OPENAI_API_KEY="\${DEEPSEEK_API_KEY}"
#   aider --model deepseek/deepseek-chat
#
${packetStdin("aider --model ollama/qwen3-coder")}
${UNVERIFIED_APPROVAL}
# Print-mode. Worktree only.
`,
  opencode: `# Writer seat — OpenCode. Multi-model local harness.
# Point it at Qwen local or DeepSeek. Control plane stays Grok.

#   opencode run --model <the project.json writerModel>
#
${packetStdin("opencode run --model <the project.json writerModel>")}
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
${packetStdin("<writer harness>")}
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
${packetStdin("aider --model deepseek/deepseek-chat")}
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
${packetStdin("<writer harness>")}
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
${packetStdin("aider --model deepseek/deepseek-chat")}
${UNVERIFIED_APPROVAL}
# Prefix is the packet. Paste cache hits.
`,
  "pc-dashscope": (m) => `# No Claude Code. Grok judges. This PC runs hands. Token is DashScope.

# 1. git, node. Install qwen-code.
# 2. export DASHSCOPE_API_KEY=... (never git, never VITE_)
# 3. node factory/tools/hands.mjs apply-topology pc-dashscope
# 4. isolate, then:
# Linux/Mac:
#    OPENAI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
#    qwen --auth-type openai --model ${m}
# Windows:
#    $env:OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
#    $env:OPENAI_API_KEY=[Environment]::GetEnvironmentVariable("DASHSCOPE_API_KEY","User")
#    qwen --auth-type openai --model ${m}
#
${packetStdin("qwen --auth-type openai --model " + m + " --approval-mode yolo")}
# 5. Writer pushes the branch only. Grok reviews and lands.
`,
  "cloud-dashscope": (m) => `# No Claude Code. Autobuild PC is off. Token is DashScope.

# 1. Place DASHSCOPE_API_KEY as a Codespaces secret once.
# 2. node factory/tools/hands.mjs apply-topology cloud-dashscope
# 3. isolate prints gh codespace create. Recipe is qwen-code hosted.
#    OPENAI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
#    qwen --auth-type openai --model ${m}
#
${packetStdin("qwen --auth-type openai --model " + m + " --approval-mode yolo")}
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
// reads no file. A lister prints one process per line, leading pid then the
// command line.
const SEAT_PID = /^\s*(\d+)\s+\S/;
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
        "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }",
      ],
    };
  }
  return { command: "ps", args: ["-eo", "pid=,args="] };
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
  const rows = [];
  for (const line of String(r.stdout == null ? "" : r.stdout).split(/\r?\n/)) {
    if (!SEAT_PID.test(line)) continue;
    const argv = commandLister(line.replace(/^\s*\d+\s+/, ""));
    const first = (argv.command || "").split(/[\\/]/).pop().toLowerCase();
    const program = SEAT_INTERPRETERS.has(first) ? argv.args[0] || "" : argv.command || "";
    const m = SEAT_HARNESS.exec(program);
    if (!m) continue;
    rows.push({ pid: Number(SEAT_PID.exec(line)[1]), harness: m[1].toLowerCase(), cmd: line.trim() });
  }
  console.log("seat census — " + (listerIdx >= 0 ? "injected" : process.platform) + " process listing");
  for (const row of rows) console.log("  " + row.pid + "  " + row.harness + "  " + row.cmd);
  console.log("  " + rows.length + " running writer seat(s)");
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

  // The hosted map, unmoved from F36's step.
  want("flash", hostedModel("deepseek-flash"), "deepseek-v4.1-flash");
  want("pro", hostedModel("deepseek-v4-pro"), "deepseek-v4-pro-0813");
  want("plus", hostedModel("qwen3-coder"), "qwen3-coder-plus");
  want("passthrough", hostedModel("deepseek-v4.1-flash"), "deepseek-v4.1-flash");

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
  want("aider carrier", carrierLine("aider"), "#   aider --model ollama/qwen3-coder < packet.txt");
  ok("the live hosted id reaches no rendered recipe", Object.values(rendered).some((t) => t.includes(hosted)));

  // Item 5 — a print-mode carrier names a VERIFIED approval mode, or the
  // recipe says that harness's option was not verified here. A print-mode
  // seat has no terminal to approve at, so a carrier that names neither is a
  // seat that reads its packet, does the analysis, and writes nothing —
  // which is what two seats launched from this file's qwen-code line did
  // before that line named --approval-mode. Every recipe the list prints is
  // read; a recipe with no stdin carrier is not a print-mode launch line and
  // has no mode to state. Read from the RENDERED recipe, and from the same
  // carrier line the recipe prints (T07, D-59).
  const APPROVAL_MODE = /--approval-mode(\s+|=)\S/;
  const carriers = Object.keys(rendered).filter((id) => carrierLine(id));
  ok("no rendered recipe prints a stdin carrier, so the approval rule proves nothing", carriers.length >= 1);
  const noMode = [];
  for (const id of carriers) {
    if (APPROVAL_MODE.test(carrierLine(id))) continue;
    if (rendered[id].includes(UNVERIFIED_APPROVAL)) continue;
    noMode.push(id);
  }
  ok("a print-mode carrier names no approval mode", noMode.length === 0, noMode);

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
      "8324 \"C:\\node\\qwen-code\\cli.js\" -p -",
      "4521 goose run --recipe factory/recipes/x.json",
      "17 node C:/tools/goose/run.py --once",
      "9001 pip show aider-chat",
      "9002 powershell -NoProfile -Command Get-CimInstance Win32_Process -- qwen",
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
    const emptyLister = join(fixture, "empty-lister.mjs");
    writeFileSync(emptyLister, "process.stdout.write('');" + NL);
    const cenEmpty = runSeat(["census", "--lister", '"' + process.execPath + '" "' + emptyLister + '"'], fixture);
    ok("an empty process listing reported a seat", (cenEmpty.stdout || "").includes("0 running writer seat(s)"), [cenEmpty.stdout]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }

  if (failed.length) {
    console.error("seat self-test failed");
    for (const f of failed) console.error("  " + f);
    process.exit(1);
  }
  console.log("seat self-test ok");
  process.exit(0);
}

console.error("usage: node factory/tools/seat.mjs list|recipe|worktree|disjoint|census|--self-test");
process.exit(1);
