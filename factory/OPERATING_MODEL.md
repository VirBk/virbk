# Operating model

Not required reading for a seat. The seat reads AGENTS, BOARD, envelope.

## Loop

Authorize → Isolate → Build → Review → Land → Record.

An envelope is the only start. A writer self-checks. A reviewer who is not the author covers behaviour and coherence. The control plane verifies at the objects, runs the landing gate from a fresh archive, fast-forwards main, restamps, deletes the envelope.

## Roles

- Control plane: envelopes, landing, board, docs. Never product code.
- Hands: `factory/tools/hands.mjs`. Git, worktrees, the landing gate. Never a model.
- Writer: one envelope, one worktree, one branch. Harness is a PM pick.
- Reviewer: same tier as the writer. Verdict on line one. Edit nothing.
- Challenger: named keystone, owner word, leads not verdicts. Never Fable.
- Owner / project manager: money, names, live effects, gates, release, and the picks in `factory/project.json`.

## Why Grok is the parent

Otto and Virbos paid once. Distilling them once is not a factory. A factory is a loop: copy, run, return, absorb, copy again.

The kit is the weights. A child is a run. An intake is the gradient — one charge, one rule, one check. Size budgets are regularization. Merging a child's board is overfitting. A trap with no check is underfit.

Grok is the only writer of the kit. A child never pushes VirBk/virbk.

## Why the board is JSON

Hand-edited markdown tables were a carrier class in Otto and Virbos: invented clocks, backticks in bash, f-string braces, PII-shaped literals that trip sweeps, and files that grew past a megabyte. `factory/board.json` is the source. `BOARD.md` is generated.

## Why the landing gate is local

Hosted CI that cannot pass taught people to stop reading badges. Minutes ran out. Runs failed in three seconds with zero steps. The gate that remains parses its steps from the commit under test. A Linux compile remains the only platform adversary, and the board names when it has not run.

## Why idle is success

Filling seats created overlapping holds. Conflict resolution is unreviewed code. Two writers is a ceiling.

## Why the session is a fuse

Every model — Grok, Claude, GPT, Qwen, DeepSeek — rots if it stays. The transcript becomes contaminated; compaction hashes the contamination. Git is memory. Split on envelope done, correction cap, spend cap, or a named decay sign. A successor reads AGENTS, BOARD, the envelope. Never SESSION_LOG. A reviewer is always a fresh session. Never resume a session id from prose. Fresh same-tier instance beats a cheaper tired model finishing the job.

## Why the control plane does not wait

A desktop session's tool policy refused `Start-Process`. The correction envelope was written. The seat sat. Hours waited on a click the owner-ask list does not name. The control plane was Opus. Remapping it cheaper would not have launched the seat.

Hands launch (`factory/tools/hands.mjs launch`). A tool-policy refusal is tried as the binary underneath, then hands, then a one-line leave. It is not an owner ask. Closed list: `factory/owner-ask.json`.

A ruling that cannot be implemented in the named holds is not issued. A green gate is named as the steps it ran, not as a suite it does not contain.

## Why derivation is exhaustive

A markdown-only grep of the queue line stamped two names as having no scope. The scope lived in the same board, further down, and in product source. A named official PDF sat unfetched while the lane waited on the owner for a citation the board had already titled.

The control plane opens every container before ZERO (`factory/tools/scopeSearch.mjs`). A named issuance is a fetch. Collection-in-practice is a second fact. Method: `factory/CONTROL_PLANE.md`. Any control plane follows it.

## Why the control plane is not the writer

The money is the tool loop. Remapping a Claude Code window to DeepSeek keeps the harness and replaces the judgment. Spawn a second seat. Leave the control plane on Grok (cloud) or Claude Code (desktop, optional). Hands are `factory/tools/hands.mjs` — they do not call a model. Sweep writers are DeepSeek Flash or local Qwen. The project manager picks the harness in `factory/project.json`. Reviewers are never weaker than the writer. Recipes: `node factory/tools/seat.mjs`. Catalog: `factory/runtimes.json`.

## Why hands are not a model

Claude Code was judgment plus hands in one window. The factory needs the split. A runner with a model is a third seat with no envelope. `hands.mjs` cuts worktrees, prints recipes, runs the landing gate, and fast-forwards. It does not pick a model, does not read a key, and does not open a GitHub Action while that Action would stay red.

## Why the reading path is a packet

A seat told to read three files reads them whole and then browses. A lane
that changed one line of YAML billed 195138 input tokens over nine turns;
the line was correct, the reading was not. The cost is not the three files.
It is the ledger inside the live board, the landed lanes beside it, and the
repository underneath. `factory/tools/packet.mjs` prints the reading path
exactly — this law, the live board slice, the traps digest, the envelope,
in that order so a provider prefix cache hits — and prints its own byte
count, so the context budget is a number the landing gate fails on rather
than a habit a tired session drops. Opening a file the packet does not
contain is not required work.

## Why the ledger is a window

`factory/board.json` is live state. Its ledger was history living inside
live state, and every seat read every row of it, forever.
`node factory/tools/ledger.mjs rotate` moves older rows to `docs/ledger/`,
which no seat reads. Nothing is deleted: a dropped row is a deletion git
would show. The board keeps the window `factory/budgets.json` names.

## Why alumni are measured, not pasted

Otto and Virbos each took a drop naming one check their own gate could run.
Days later `node factory/tools/alumni.mjs drop-status` reported both not
adopted: the script absent, the gate not naming it. A drop nobody measures
is a letter, not a lesson. The scan is read-only, runs against a working
copy, and emits candidate intakes in the shape the intake gate already
validates. An alumnus contributes by being measured. A new child runs the
same scan on itself before its first landing, and copies the check pack
(`alumni.mjs checks`) with the name of whoever paid for each line
(`alumni.mjs provenance`).

## The factory's provisional boundaries

AGENTS section 5 splits boundaries in two. The owner's do not move and stay in AGENTS. These are the factory's own, and they are this repository's current best guess: each has paid for itself so far, each holds until evidence replaces it, and `factory/tools/experiment.mjs` is how one comes down on purpose — a hypothesis, a measure, an expiry — rather than by decree or by a waiver nobody can read later. None of them is a reason to refuse an idea outright.

This justification rests on a seat reading every trap. F36 scopes a seat's digest to the traps whose object meets its Holds, and when it lands, some of the rows below can be absent from a given seat's digest and the reason these moved stops holding silently. F36's acceptance carries that.

They live here rather than in AGENTS because every one is already enforced where a seat actually meets it: by a trap in the digest every packet carries, or by a rule in AGENTS section 3. Carrying a second copy in AGENTS bought nothing and cost 1174 bytes of a 12 KB cap, and forty-one copies of one rule is how a governance file drifts (D-54).

What pays for each, checked at the objects when this moved:

| Boundary | Enforced by |
| --- | --- |
| Control plane not pointed at a cheap model; Cursor cloud cannot take the token; cloud isolate is git-bus or codespace | T19, T44 |
| No third seat with a model | T29, T46 |
| Envelopes are git blobs | T30 |
| A writer never reviews its own branch | T20 |
| A writer never fast-forwards main | AGENTS section 3, "push the branch only, never main" |
| A reviewer is never weaker than the writer | T20 |
| A child never writes the parent kit | T23 |
| An intake without a check is refused | T24 |
| An absorbed reference is not a live child; not this sitting as its control plane | T41, T47 |

- Do not point the control-plane session at DeepSeek or Qwen. Spawn a writer seat. Cursor Cloud Agents cannot take that token. Cloud isolate is `git-bus` or `codespace` (`factory/HANDS.md`).
- Do not invent a third seat with a model. Claude Code absent is the default. A DeepSeek or DashScope token is the writer; the topologies are in `factory/runtimes.json`. Do not install Claude Code to spend it.
- Envelopes live as git blobs in `factory/envelopes/`. Issues are not the board.
- A writer never fast-forwards main and never reviews its own branch.
- A reviewer is never a weaker model than the writer.
- A child never writes VirBk/virbk. Returns arrive as intakes. Absorbing is a Grok envelope.
- An intake without a check is refused. A trap without a check is a diary.
- An absorbed reference is not a live child. It takes a drop from `factory/drops/` after its running seats finish, not the kit. Helping it is a sidecar factory, not an overlay, and not this sitting as its control plane.

## The full index

AGENTS section 9 carries the rows a seat or an issuing control plane reaches for constantly. This is the whole map, kept verbatim so nothing is lost in the shortening.

| Need | File |
|---|---|
| Live state | `BOARD.md` (generated) / `factory/board.json` (source) |
| Work packages | `factory/packages.json` |
| Decisions | `factory/decisions.json` |
| Traps | `factory/traps.yaml` |
| Size budgets | `factory/budgets.json` |
| Landing steps | `factory/landing-checks.json` |
| Landing gate | `factory/tools/landingGate.mjs` |
| Envelope template | `factory/templates/ENVELOPE.md` |
| 10/10 rubric | `factory/ASSESSMENT.md` |
| Session fuse | `factory/sessions.json` |
| How to copy | `factory/COPY.md` |
| Runtimes | `factory/runtimes.json` |
| PM picks | `factory/project.json` |
| Contribute | `access`, `commitCredit` in `factory/project.json` |
| Cloud isolate | `factory/HANDS.md` |
| Prompt cache | `promptCache` in `factory/project.json` |
| Token only | topologies in `factory/runtimes.json` |
| Help a product | `factory/help.json`. Never overlay alumni. |
| Writer path | `factory/writer-paths.json`, `factory/tools/route.mjs` |
| Launch | Control plane. Recipe: `factory/tools/seat.mjs` |
| Envelope blobs | `factory/envelopes/` |
| Writer recipes, launch | `factory/tools/seat.mjs` |
| Parent register | `factory/lineage.json` |
| Alumni drops | `factory/drops/` |
| Intake template | `factory/templates/INTAKE.md` |
| Intake gate | `factory/tools/intake.mjs` |
| Lane records | `docs/log/<lane>.md` |
| Owner console | `factory/CONSOLE.md` |
| Closed concerns | `factory/concerns.json` |
| Derivation | `factory/CONTROL_PLANE.md` |
| Owner-ask list | `factory/owner-ask.json` |
| Sparks (look, not law) | `factory/sparks.json` |
| Reading path, context budget | `factory/tools/packet.mjs` |
| Ledger window | `factory/tools/ledger.mjs` |
| Alumni measurement, check pack | `factory/tools/alumni.mjs` |
| Every gate step and tool | `factory/landing-checks.json` |
| Versioned interfaces | `contracts/` |

Every other document is history or reference until the owner moves it.
