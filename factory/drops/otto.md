# OWNER DROP — 2026-09-17 night — useful only

Supersedes the evening file (D-29). That file was more law into files
already over cap, with no check. A trap without a check is a diary
(T24). Do not paste it.

Alumni. Not a child. Not a kit overlay. Shared strength is a check
Otto’s gate already knows how to run. Not another sermon.

## WHEN

Adopt after **O38 has landed** and no writer is holding files.

Proof, all three:

1. Newest `BOARD.md` Now says O38 LANDED at a sha reachable from `origin/main`.
2. `git ls-remote origin refs/heads/o38-report-opt-out` is empty, or that sha is an ancestor of `origin/main`.
3. No worktree named `OTTO-o38` holds `src/reporting/**` dirty.

Idle seats staying idle is not a blocker. A running O38 seat is.

## Feed (this is the drop)

One records sitting on Otto. Records get no review. Same commit does
both: archive the live files under cap, then add the step so the next
landing can pass. Do not add the step first and leave the files fat —
that is a permanent red, which is T09.

### 1. Size step on Otto’s gate

Otto already parses `tools/landingChecks.yml`. Add one step. Do not
replace `tools/landingGate.js`. Do not copy `factory/`.

`tools/sizeBudget.js` (new, next to the gate):

```js
#!/usr/bin/env node
const { existsSync, statSync } = require("node:fs");
const { join } = require("node:path");
const root = join(__dirname, "..");
const caps = [
  ["AGENTS.md", 12],
  ["BOARD.md", 40],
  ["docs/TRAPS.md", 48],
  ["docs/DECISION_REGISTER.md", 80],
];
const fail = [];
for (const [p, cap] of caps) {
  const f = join(root, p);
  if (!existsSync(f)) continue;
  const kb = statSync(f).size / 1024;
  if (kb > cap) fail.push(p + " " + kb.toFixed(1) + " KB > " + cap + " KB");
}
if (fail.length) {
  console.error("size budget failed:");
  for (const line of fail) console.error("  " + line);
  process.exit(1);
}
console.log("size budget ok");
```

In `tools/landingChecks.yml`, under `jobs.check.steps`, after Install:

```yaml
      - name: Size budgets
        run: node tools/sizeBudget.js
```

Archive at 80% of cap. Do not append to a live file that is over.
A landing that grows a live file past cap is red. That is the point.

Live on `3c52a90`: BOARD 236 KB, TRAPS 94 KB, register 342 KB, AGENTS
over 12 KB. The records sitting has to cut them before the step is
green.

### 2. Archive (same sitting)

- BOARD: newest Now only. Rest to `docs/BOARD_ARCHIVE_2026-09-17.md`.
  They already split on 2026-09-11 and grew it back. The step is why
  it stays small. Do not stack another Now section.
- TRAPS: do not append. Keep a live file of one-liners under 48 KB.
  Body can archive. Do not re-append the three evening lines already
  on main at `3c52a90`.
- Register: do not mint essay rows. One line if a row is owed. Or skip
  until the live file is under 80 KB.
- AGENTS: do not grow. No pointer. Handoff is still AGENTS + BOARD.

### After adoption

The script fails. It does not split. A split during a keystone is
the delivery tax.

- First sitting cuts BOARD to newest Now only. One records commit,
  no review. Next product landing is green. A half-cut that leaves
  the file over cap is T09.
- After that, restamp Now only. Do not copy archived novels back.
- At 80% of cap, the control plane archives in its own records
  commit, between landings. Not a writer envelope. Not the same
  commit as a product landing. A keystone does not wait on a split.
- Documentation is never a lane.

### 3. Files, not prose

- D-153 is a sitting waiver. Gitignored `ops/.waiver`. Dies at sitting
  close. Not AGENTS, not TRAPS, not BOARD.
- A eureka that is not yet a trap: `ops/sparks.json`. Look, not law.
  Absorb with a check or drop with because. Do not write
  `CONTROL_PLANE_HANDOFF*.md` as a briefing.

### 4. When Otto pays again

Paste an intake to the Grok control plane. No PR on VirBk/Grok or
VirBk/virbk. Charge, rule, check. Refuse BOARD, SESSION_LOG, copied
counts, real people, a rule with no check. Meet eligibility, opt-out,
and client rules stay here (`reject`). Windows/harness rows stay
`machine`.

## Already on main — do not re-append

At `3c52a90`: session notes are not the record; a search that finds
nothing is the search; keystone and challenge are D-72 and D-132 at
issue. Those have TRAPS lines. They do not get another paragraph.

## Adoption check (parent side, read-only)

The parent measures this drop instead of assuming it landed:

```
node factory/tools/alumni.mjs drop-status otto <path to this working copy>
node factory/tools/alumni.mjs scan <path to this working copy>
```

The first names the script and the gate file above and exits 2 while the
gate does not name the script. The second lists every over-cap live file
and the bytes every seat reads before any work, each mapped to the trap
that paid for it. Neither writes to this repository.

## Do not feed

- `factory/` overlay, or replace `AGENTS.md` with Grok’s
- Replace `tools/landingGate.js`
- Grow TRAPS, register, AGENTS, or BOARD
- Five essay register rows, three new trap sermons
- Remap writers or the control plane onto DeepSeek or Qwen
- Dual sitting as control plane of Grok and Otto
- Meet, opt-out, digest, or CRM rules on Grok
- The evening drop. This file replaces it
- Another reporting lane from this drop

## What does not change

Product, keystones, Sonnet/Opus table, Windows seats, owner-ask,
gates G1–G4, one private remote, `rules/*.v1.json`, idle-is-success,
the existing 21 gate steps.

Overlay of `factory/` stays shelf: quiet week, no running seats,
owner word, kit pin. Never a GitHub fork.

---

# SECOND DROP — 2026-09-22 — one check, still useful only

Does not supersede the 2026-09-17 file above. That one is the size step
and it stands whether or not it has landed yet. This one is a different
check and can be taken on its own.

Alumni. Not a child. Not a kit overlay. Still a check Otto's own gate
already knows how to run.

## WHEN

Adopt whenever no writer holds `tools/landingGate.js` dirty. It does not
wait on a lane: it changes what the gate REPORTS, never what it tests.

## Feed (this is the drop)

### A gate that cannot run its shell says so, instead of failing every step

What this cost the parent: two paid seats, on two separate lanes,
spending calls to prove that a red was not their own change.

The shape. A gate that runs each step by spawning a shell with a script
file and a working directory is reporting two different things through
one channel. If the step fails, the commit is bad. If the SHELL cannot
read the script path or take that directory, every step fails at every
commit — including a commit that is green thirty seconds later from a
different terminal. The gate prints step names and sends stderr to a log
file, so from inside a headless seat the cause is invisible. The seat
sees twenty-one reds and no reason, and starts debugging its own diff.

On the parent's machine `bash` resolves through PATH order to either
Git's bash, which reads Windows paths, or the WSL launcher, which strips
the backslashes and can read neither the script nor the cwd. Same gate,
same commit, opposite verdicts.

The check. Before the first step runs, probe the shell **in a step's own
form** — write a trivial script file to the same directory the step
scripts go in, and spawn it exactly the way a step is spawned, with the
same working directory. If that probe does not exit 0, print ONE
diagnostic naming the shell, the probe path, the working directory and
what the shell wrote to stderr, run no step, print no step line, and
exit with a status that is NOT the status of a failed gate. A caller and
a seat can then tell "this shell cannot run the gate" from "your commit
is bad".

The form is the whole of it. A probe written as `bash -c true` SUCCEEDS
on the broken launcher and closes nothing — the launcher takes a command
string fine and only fails on a file path. A probe that does not take
the step's form is a check that cannot fail, which is the parent's T09
and worth less than no check at all.

Proof it works, before you believe it:

1. With a working shell, the gate runs every step and the verdict is
   unchanged. Force the probe to report failure and confirm that case
   goes red — a fixture that cannot fail proves nothing.
2. Point the gate at a shell that does not exist. One diagnostic, no
   step lines, the unrunnable status.
3. Point it at a shell that runs but cannot read the script. Same
   diagnostic. This is the case a check written against the spawn error
   alone will miss, and it is the case that actually happens.
4. Re-point the probe at `bash -c true` under case 3 and watch every
   step go red again. That is the counterfactual; keep it.

Do not copy `factory/`. Do not replace the gate runner. This is a dozen
lines at the top of the run loop and one new exit status.

## What the parent is NOT sending

The lesson that cost it most this sitting is not here, because it is not
a check: an assertion that stops short of the object that ships. It
arrived three times in six lanes by three different routes. If Otto
wants it, it returns as an intake with a check attached, not as prose.
