# BOARD

Generated from `factory/board.json`. Do not hand-edit this file. Restamp with `node factory/tools/renderBoard.mjs`.

## Now

Sitting 7. F31 issued: the packet already orders static bytes first for a provider prefix cache, and nothing fails if that order changes. A local DashScope writer seat holds factory/tools/packet.mjs and docs/log/f31.md; a fresh Claude reviewer follows. D-45 is being paid: a writer seat with an independent reviewer. D-49 still needs the owner word. References Otto and Virbos remain read-only. Overlay still shelf. Path dashscope.

Remote: VirBk/virbk. References: VirBk/Otto, VirBk/virbos.

## Gates

| ID | State | Title |
| --- | --- | --- |
| G0 | open | Synthetic data only |
| G1 | closed | Real product data in systems (never in git) |
| G2 | closed | Live alerts / client messages |
| G3 | closed | Downstream writes |
| G4 | closed | Production deploy |

No envelope opens a gate.

## Lanes

| ID | State | Hold | Title |
| --- | --- | --- | --- |
| F0 | landed | factory/, AGENTS.md | Stand up the factory kit |
| F1 | landed | none | Owner specs land |
| F2 | landed | AGENTS.md §1 and §5 | Name the product paragraph and never-move rules |
| F3 | landed | factory/tools/seat.mjs, docs/log/f3.md | First cheap writer envelope |
| F4 | landed | factory/lineage.json | Parent factory lineage loop |
| F5 | landed | factory/sessions.json | Session fuse protocol |
| F6 | landed | factory/project.json, factory/tools/hands.mjs | Hands split; PM-pickable topologies |
| F7 | landed | factory/CONSOLE.md | Owner console and token mix |
| F8 | landed | factory/drops/, factory/lineage.json | Alumni drops for Otto and Virbos |
| F9 | landed | factory/project.json, factory/runtimes.json | GitHub contribute options |
| F10 | landed | factory/project.json, factory/tools/hands.mjs | Cloud CP deploys the writer terminal |
| F11 | landed | factory/project.json, factory/runtimes.json | Prompt cache as a native prefix, orchestrated |
| F12 | landed | factory/project.json, factory/runtimes.json | Token-only writer, no Claude Code |
| F13 | landed | factory/project.json, factory/runtimes.json | Sidecar factory for an ongoing product |
| F14 | landed | factory/writer-paths.json, factory/tools/route.mjs | Owner-picked writer ladder and path router |
| F15 | dropped | factory/tools/seat.mjs | Map hosted writer model to a real DashScope id |
| F16 | landed | factory/tools/seat.mjs, docs/log/f16.md | Hosted recipes print the live DashScope model id |
| F17 | landed | factory/project.json, factory/tools/seat.mjs, docs/log/f17.md | DashScope DeepSeek Flash on the live seat |
| F18 | landed | factory/sparks.json, factory/tools/sitting.mjs, factory/traps.yaml, docs/log/f18.md | Close F15; absorb S01 as T49; drop S02 |
| F19 | landed | .github/workflows/landing.yml, factory/landing-checks.json | Public-repo landing Action |
| F20 | landed | .github/workflows/writer.yml, factory/tools/ghaWriter.mjs | GitHub Action writer runner |
| F21 | landed | .github/workflows/landing.yml, docs/log/f21.md | Shallow checkout for the landing gate |
| F22 | landed | factory/tools/kitCheck.mjs, factory/packages.json, factory/lineage.json, docs/log/f22.md | Kit holds its own shape |
| F23 | landed | factory/tools/landingGate.mjs, docs/log/f23.md | Landing gate runs where the control plane sits |
| F24 | landed | factory/tools/packet.mjs, AGENTS.md, factory/budgets.json, docs/log/f24.md | The packet: a reading path with a byte budget |
| F25 | landed | factory/tools/ledger.mjs, factory/tools/renderBoard.mjs, docs/log/f25.md | Board ledger is a window, not a novel |
| F26 | landed | factory/tools/alumni.mjs, factory/lineage.json, contracts/intake.v1.json, docs/log/f26.md | Alumni contribute by measurement |
| F27 | landed | factory/tools/seatReturn.mjs, contracts/seat-return.v1.json, docs/log/f27.md | A return pastes the command |
| F28 | landed | factory/tools/ghaWriter.mjs, factory/tools/seat.mjs, docs/log/f28.md | The seat is launched with the packet |
| F29 | landed | factory/tools/seatReturn.mjs, factory/returns.json, docs/log/f29.md | Spend and cache hits survive as rows |
| F30 | landed | factory/tools/experiment.mjs, factory/experiments.json, factory/tools/landingGate.mjs, docs/log/f30.md | A rule can be suspended on purpose, with an expiry |
| F31 | issued | factory/tools/packet.mjs, docs/log/f31.md | The packet prefix is byte-stable, and a check proves it |

## Holds

- AGENTS.md / factory rules — control plane
- factory/board.json — control plane
- factory/lineage.json — control plane
- factory/project.json — control plane
- factory/envelopes/ — control plane
- contracts/seat-return.v1.json — control plane
- contracts/intake.v1.json — control plane
- contracts/project.v1.json — control plane
- factory/sessions.json — control plane
- factory/CONSOLE.md — control plane
- factory/CONTROL_PLANE.md — control plane
- factory/owner-ask.json — control plane
- factory/sparks.json — control plane
- factory/drops/ — control plane
- factory/writer-paths.json — control plane
- factory/tools/route.mjs — control plane
- factory/concerns.json — control plane
- factory/budgets.json — control plane
- factory/landing-checks.json — control plane

## Keystones

- Dual-runtime closed loop: spec → runtime-stamped envelope → cheap writer return → strong review → land → spend in the lane log
- Parent flywheel: copy → run → return intake → Grok absorbs under size budgets

## Shelf

- Kit overlay onto Otto or Virbos — trigger: Quiet week, no running seats, owner word. Pin a kit SHA. Never a GitHub fork.

## Ledger

Live window. Older rows are in `docs/ledger/`, which is history, not the reading path.

- 2026-09-20 S03 absorbed as T57, S04 as T58, S06 as T56. S05 dropped: T50 already holds it.
- 2026-09-20 Control plane ran as its own writer for this records sitting on the owner word; no independent reviewer session existed. The gate and the new self-tests are the evidence. D-45.
- 2026-09-20 Landing gate ran on the control-plane machine for the first time: 19 steps, GATE PASSED, from a fresh archive of the commit under test. The Ubuntu Action runs the same 19.
- 2026-09-20 Newlines pinned with .gitattributes so the working tree, the gate archive and the runner measure one number. Each alumni drop now names the read-only command the parent uses to measure adoption.
- 2026-09-20 F28 landed. The writer Action and every seat recipe launch on the packet instead of an envelope plus a browse. ghaWriter self-test fails if the packet stops being the prompt. T61. D-38.
- 2026-09-20 Sitting closed twice in one day: once after the records lanes, once after F28. Two closes are two sittings in the record, which is what happened.
- 2026-09-20 A feedback-loop handoff was assessed against live main and nothing was landed from it. The checks it would have turned red are named in D-46. The one gap it found is open as S07: no command sums spend or cache hits across returns.
- 2026-09-20 F29 landed. A return that passes validation can be recorded; the row is keyed by its content so recording it twice is refused, and spend sums by lane and by model. The store is empty until the next metered return. S07 absorbed as T65. D-47.
- 2026-09-20 Sitting 5 closed with no open sparks. S07 was the only one minted and it was absorbed as T65 in the same sitting. The board is idle: no lanes, no envelopes, one gate open by design.
- 2026-09-20 F30 landed. factory/tools/experiment.mjs suspends a named landing step for a hypothesis with an expiry, and the gate prints what a suspended step found instead of hiding it. Landed inert: no experiment is open. T66. D-48.
- 2026-09-20 D-49 deferred to the owner word: AGENTS section 5 mixes owner boundaries with engineering guesses, so a session cites a preference as physics. Proposed replacement text is in docs/log/f30.md. The session that proposed it was refused twice by the desktop tool policy for editing its own instruction file, which is the right refusal.
- 2026-09-20 Sitting 6 closed. Two open items carried to the next control plane: D-49 needs the owner word, D-45 needs a writer seat. Nothing is running and no experiment is open.
- 2026-09-20 F31 issued. A handoff naming four pillars was re-assessed against live main: cloud orchestration is already built and green, the prompt-cache prefix is built by construction but unguarded, the spend meter has zero rows so no cap can be set from data yet, and the memory feedback loop has no machine-readable record of a correction to count. F31 takes the one gap with no data dependency. Records issuance skips Actions so the GHA writer does not race the local seat.
