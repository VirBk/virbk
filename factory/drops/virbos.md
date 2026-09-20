# OWNER DROP — 2026-09-17 night — useful only

Supersedes the morning F8 file. That file was more law into files
already over cap, with no check. A trap without a check is a diary
(T24). Do not paste it.

Alumni. Not a child. Not a kit overlay. Shared strength is a check
Virbos’s gate already knows how to run. Not another sermon.

## WHEN

Adopt after **PK-3b** and **LEAVE-TYPE-KEY** have landed and no writer
is holding the records files.

Proof, all three:

1. Newest `BOARD.md` Now says PK-3b LANDED at a sha reachable from `origin/main`.
2. Newest `BOARD.md` Now says LEAVE-TYPE-KEY LANDED at a sha reachable from `origin/main`.
3. No writer holds `BOARD.md`, `DECISION_REGISTER.md`, `docs/TRAPS.md`, `AGENTS.md`, or `tools/check.yml` dirty.

Idle seats staying idle is not a blocker. A running product seat on
those files is. The owner's "issue no other lane" was that session's
waiver. It is not WHEN forever. This sitting is records, not a
product lane.

Live on `aaf2b7b8`: PK-3b LANDED at `ac1c5fc`. LEAVE-TYPE-KEY LANDED
at `689eb1a`. Now says NOTHING IS RUNNING. The contract lane and
PK-3b follow-ons are booked, not issued. Do not issue them from this
drop.

## Feed (this is the drop)

One records sitting on Virbos. Records get no review. Same commit
does both: archive the live files under cap, then add the step so the
next landing can pass. Do not add the step first and leave the files
fat — that is a permanent red, which is T09.

### 1. Size step on Virbos’s gate

Virbos already parses `tools/check.yml`. That file is **not** a
GitHub workflow. The parser is the comment at the top of the file:
two spaces before `- `, four before a key; `run` split on
whitespace; no quoting, no shell, no `#` in `run`; exactly one of
`run` or `copy`; sweeps first, before `npm ci`. Add one step. Do not
replace `tools/landingGate.js`. Do not copy `factory/`. Do not invent
Otto’s `jobs.check.steps` indent — that shape is refused here.

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
  ["DECISION_REGISTER.md", 80],
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

Register path is the repo-root file. Not `docs/DECISION_REGISTER.md`.

In `tools/check.yml`, after the two sweep steps, before `root install`:

```
  - name: size budgets
    run: node tools/sizeBudget.js
```

That placement is load-bearing: sweeps refuse `node_modules`; this
script needs none. Do not put it after `npm ci`. Do not add
`sweepCounts.js` (would stay red). Do not add integration or e2e.

Archive at 80% of cap. Do not append to a live file that is over.
A landing that grows a live file past cap is red. That is the point.

Do **not** cap `BUSINESS_RULES.md` (statutory pack). Do **not** cap
or unfreeze `SESSION_LOG.md` (frozen). Do not cap `BUILD_PLAN.md`.

Live on `aaf2b7b8` (GitHub size / 1024): BOARD 262.0 KB, register
141.3 KB, TRAPS 21.7 KB, AGENTS 11.3 KB. The records sitting has to
cut BOARD and the register before the step is green.

### 2. Archive (same sitting)

- BOARD: newest Now only. Rest to a new dated file under
  `docs/archive/` that does **not** overwrite
  `docs/archive/BOARD_2026-09-17.md` (the 1.18 MB split) or
  `docs/archive/BOARD_2026-09.md`. They already split on 2026-09-17
  and grew the live file back to 262 KB. The step is why it stays
  small. Do not stack another Now section.
- TRAPS: do not append. Live file is under 48 KB. Keep it there.
- Register: do not mint essay rows. One line if a row is owed. Or
  skip until the live file is under 80 KB.
- AGENTS: do not grow. No pointer. Under 12 KB already. Handoff is
  still AGENTS + BOARD.

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

- A sitting waiver is gitignored `docs/.waiver`. Dies at sitting
  close. Not AGENTS, not TRAPS, not BOARD.
- A eureka that is not yet a trap: `docs/sparks.json`. Look, not law.
  Absorb with a check or drop with because. Do not write
  `handoff.md` as a briefing.

### 4. When Virbos pays again

Paste an intake to the Grok control plane. No PR on VirBk/Grok or
VirBk/virbk. Charge, rule, check. Refuse BOARD, SESSION_LOG, copied
counts, real people, a rule with no check. Statutory, compensation,
tenant, and authorization rules stay here (`reject`). Windows or
harness rows stay `machine`.

## Already on main — do not re-append

Alumni, not child; sparks look-not-law; named issuance is a fetch;
collection is a second fact; sitting waiver expires. Those are
standing. They do not get four new register rows or four new trap
sermons. The morning file is replaced.

## Adoption check (parent side, read-only)

The parent measures this drop instead of assuming it landed:

```
node factory/tools/alumni.mjs drop-status virbos <path to this working copy>
node factory/tools/alumni.mjs scan <path to this working copy>
```

The first names the script and the gate file above and exits 2 while the
gate does not name the script. The second lists every over-cap live file
and the bytes every seat reads before any work, each mapped to the trap
that paid for it. Neither writes to this repository.

## Do not feed

- `factory/` overlay, or replace `AGENTS.md` with Grok’s
- Replace `tools/landingGate.js` or rewrite `tools/check.yml`
- Grow TRAPS, register, AGENTS, or BOARD
- Four essay register rows, four new trap sermons
- Cap `BUSINESS_RULES.md` or unfreeze `SESSION_LOG.md`
- Remap writers or the control plane onto DeepSeek or Qwen
- Dual sitting as control plane of Grok and Virbos
- Statutory, compensation, tenant, or authorization rules on Grok
- The morning drop. This file replaces it
- The contract lane, or PK-3bW / PK-3bS / PK-3b-READMARK /
  NOTIF-AUDIT-SUBJECT, from this drop
- Grok’s “owner word each time” for challenges
- Grok’s “control plane lands main”

## What does not change

Product, keystones (pay math, RLS / tenant transactions,
authorization, migrations, Philippine statutory pack), Sonnet/Opus
table, owner fast-forward, challenge-without-ask (default on a
keystone, leads never a verdict), three product writers plus one e2e
seat, six-seat ceiling, frozen SESSION_LOG, `BUSINESS_RULES.md`,
walkthrough as acceptance, one private remote, the existing
`tools/check.yml` steps, sweeps first.

Overlay of `factory/` stays shelf: quiet week, no running seats,
owner word, kit pin. Never a GitHub fork.
