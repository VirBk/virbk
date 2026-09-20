# GROK Factory working rules

Read this file, then `BOARD.md`, then your envelope. Read `factory/traps.yaml` once. Nothing else is required reading unless your envelope names it.

This file is capped at 12 KB. If a change would grow it, move the detail to a named document and leave a pointer.

## 1. What this repository is

GROK Factory is the parent build operating system. Child projects copy `AGENTS.md` and `factory/`. They return portable intakes — the charge, the rule, the check. Grok is the only writer of the kit.

It is dual-runtime. A strong control plane — Grok in the cloud, or Claude Code on the desktop — issues one-page envelopes, launches the writer, reviews returns, and lands. A third hands actor is not the loop (D-33). Cheap writer seats — DeepSeek or Qwen; harness the project manager picks in `factory/project.json` — execute the envelope. The control plane does not become the writer.

Acceptance: the owner walks spec → envelope stamped with a runtime → cheap writer return → strong review → land → spend pasted in the lane log. A child that paid for a lesson files an intake; absorbing it is a Grok envelope.

A sweep must not spend a keystone model. Idle seats stay idle. A child's board is not a gradient. Otto and Virbos are alumni: they take a drop, not the kit.

## 2. How work starts

An envelope from the control plane is the authorization. There is no coding hold. A backlog item, a recommendation, or “continue” is not an envelope.

An envelope is one page: the work and its acceptance, the base commit from `git ls-remote origin refs/heads/main`, the scope and holds, what must stay true, the verification, the runtime stamped from `factory/project.json`, the spend cap, the return format, and the two print-mode sentences.

Your reading path is the packet: `node factory/tools/packet.mjs seat <LANE>` — this file, the live board slice, the traps digest, your envelope, in that order, with its byte count. Opening a file the packet does not contain is not required work. Why: `factory/OPERATING_MODEL.md`.

Product delivery is the critical path. A document is changed only when a change makes it false, and only that line. Documentation is never a lane of its own.

Two writers at a time is a ceiling, not a target. A seat with no blocker on the critical path is not filled.

## 3. How work lands

- A writer works on a branch in its own worktree taken from live main, never from a checkout that may be behind.
- Before pushing, read live main again. If it moved, rebase onto it and push again. Push the branch only, never main.
- A code envelope gets one review that covers behaviour and coherence together. A records envelope gets none.
- The reviewer is never the author, and is never a weaker model than the writer.
- Corrections stay with the writer. Sweep-tier: one correction, then split. Keystone: two, then split. No third round.
- A session is a fuse. Split on envelope done, correction cap, spend cap, or a named decay sign (`factory/sessions.json`). A successor reads this file, BOARD, the envelope — never a transcript, never a compaction. It looks at `factory/sparks.json`; it does not obey it.
- The control plane lands: it verifies the return at the objects, proves any rebase with `git range-diff` and a blob sweep, runs the landing gate from a fresh archive of the commit, fast-forwards main, restamps the board, deletes `factory/envelopes/<lane>.md`.
- Nothing is issued from an unlanded tip. Siblings only when the board names their files disjoint.
- Shared files are single-writer holds: `contracts/` and any generated client, the package manifest and lockfile, the app shell and routes, `factory/board.json`, this file.
- Every writer envelope carries a self-check: drive the list a reviewer of the lane would be given, fix what it finds, record what changed in the lane log.
- Main is frozen between a landing’s branch push and its fast-forward. Hold board edits until after.

## 4. The record

- One-line commit subject. The body may add a few lines.
- Each lane writes `docs/log/<lane>.md`: what changed, the command that measured it. No essays, no review transcripts, no commit id of its own (rebase rewrites it).
- Live documents are edited in place. History lives in git. No struck-through corrections, no dated correction blocks, no `SESSION_LOG.md`.
- No copied numbers. A count is pasted from the command that produced it, with the command, or omitted.
- `BOARD.md` is generated from `factory/board.json`. Do not hand-edit the markdown. The ledger there is a window; `node factory/tools/ledger.mjs rotate` moves older rows to `docs/ledger/`.
- Size budgets in `factory/budgets.json` fail the landing gate. Archive at 80% of cap. Do not append to a live file that is over budget.

## 5. Boundaries that never move

- Never commit real people, pay, client, or credential data. Fixtures are synthetic and obviously so.
- One private remote. No second remote, no sync client, no deployment without the owner’s word.
- Merge, release, deployment, destructive action, and protected-data access are the owner’s acts.
- Every route declares its permission or its authenticated-only status; a route with neither is refused.
- No envelope opens a gate. Gates live on the board. The owner closes them with a word.
- Do not point the control-plane session at DeepSeek or Qwen. Spawn a writer seat. Cursor Cloud Agents cannot take that token. Cloud isolate is `git-bus` or `codespace` (`factory/HANDS.md`).
- Do not invent a third seat with a model. Claude Code absent is the default. A DeepSeek or DashScope token is the writer; the topologies are in `factory/runtimes.json`. Do not install Claude Code to spend it.
- Envelopes live as git blobs in `factory/envelopes/`. Issues are not the board.
- A writer never fast-forwards main and never reviews its own branch.
- A reviewer is never a weaker model than the writer.
- API keys live in a seat's environment, never in git, never in a `VITE_` variable.
- A cloud writer receives a worktree of the envelope holds, not the owner's disk.
- A child never writes VirBk/virbk. Returns arrive as intakes. Absorbing is a Grok envelope.
- GitHub write access is not a contributor. A contributor is a commit that landed on the default branch with an email on a GitHub account. Parent `access` is `owner-only`.
- An intake without a check is refused. A trap without a check is a diary.
- An absorbed reference is not a live child. It takes a drop from `factory/drops/` after its running seats finish, not the kit. Helping it is a sidecar factory, not an overlay, and not this sitting as its control plane.

## 6. Data rules that never move

- Assume at-least-once delivery. External side effects are idempotent; keys name the thing done, are checked read-first, and are backed by a constraint.
- An external side effect is recorded as attempting before the call and as done after it.
- Corrections are new rows. Audit rows are written in the same transaction as the change.
- Times are stored in UTC. A business date uses one helper with an injected clock.
- Rules and thresholds change only through a dated row in `factory/decisions.json`.

## 7. How choices reach the owner

The control plane decides engineering and product defaults and records each as a dated row. The owner reverses any row with a word.

Ask, in one line at the moment it is needed, only for: money, writer API keys, real people’s names, anything that sends a message to a client or writes to a CRM, opening a gate, release or destructive action. A tool-policy refusal is not on this list. The control plane launches seats. Closed list: `factory/owner-ask.json`.

A deferral is a decision with a stated trigger. It is not re-raised until the trigger.

A writer that meets a product-changing choice mid-lane prints the decision, the options, and what it observed, isolates the interim in one function, and does not start a study.

## 8. The control plane and the board

The control plane is the session the owner selects. It reads returns, verifies them at the objects, issues envelopes, keeps the board, and writes documentation directly. It does not write product code. Derivation: `factory/CONTROL_PLANE.md`. A ZERO that did not name its containers is not a finding. A named issuance is a fetch, not an ask.

On every return, before anything else is issued:

1. Read live main. Confirm the return’s base and the commit’s parent chain.
2. Confirm the changed file set is the envelope’s and nothing more. A stray file is a stop.
3. Run or read the tests the return names.
4. Issue the one review, naming the commit. After approval, land, restamp, delete the envelope.

Keystones are a closed named list on the board. A challenge pass runs only on one of those, only with the owner’s word, and produces leads rather than a verdict. Never Fable.

A handoff is this file plus `BOARD.md`. There is no handoff document. A eureka lands as a spark (`factory/sparks.json`), not as a trap. A session-only waiver is the envelope or gitignored `factory/.waiver`. Last act: `node factory/tools/sitting.mjs close`.

The repository is memory. The session is a fuse: every model rots if it stays. Do not pick one that does not. Split it. A reviewer is always a fresh session, never resumed from a session id in prose; neither is a challenge seat. A writer that notices its own decay stops and returns. Detail: `factory/sessions.json`.

## 9. Where things are

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
