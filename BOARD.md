# BOARD

Generated from `factory/board.json`. Do not hand-edit this file. Restamp with `node factory/tools/renderBoard.mjs`.

## Now

CONTROL PLANE HELD — Claude Code desktop, sitting 10. F33 is ISSUED and runs ALONE; no sibling until it lands (D-54). Handoff and the first acts in order: D-55. Queue after F33: F34 alone, then F35 to F38, F36 after F33. Reading path sits at the D-56 cap with about a KB of headroom; F33 then F36 restore it. Ceilings do not move; compact instead (D-52, D-54). Orchestration model: D-53. No experiment is open. While F33 is issued the landing gate is red by design and every push to main carries a skip-ci marker. This session's tool policy refuses every seat launch, local and dispatched, so the owner is the launcher. Otto and Virbos stay read-only. Overlay still shelf.

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
| F31 | landed | factory/tools/packet.mjs, docs/log/f31.md | The packet prefix is byte-stable, and a check proves it |
| F32 | landed | factory/tools/seatReturn.mjs, contracts/seat-return.v1.json, docs/log/f32.md | The control plane reads the meter into the return |
| F33 | issued | factory/tools/spark.mjs, factory/tools/packet.mjs, factory/tools/sizeBudget.mjs, factory/budgets.json | Packet windowing and growth bands |
| F34 | queued | AGENTS.md, factory/OPERATING_MODEL.md | AGENTS carries the orchestration model and sheds the provisional group |
| F35 | queued | factory/tools/alumni.mjs, contracts/intake.v1.json | Alumni scan reads a child TRAPS.md |
| F36 | queued | factory/traps.yaml, factory/tools/packet.mjs | A trap names its object; a seat packet is scoped to its Holds |
| F37 | queued | factory/tools/seat.mjs, factory/landing-checks.json | Holds proved disjoint, and a seat census from the process table |
| F38 | queued | factory/tools/seatReturn.mjs, contracts/seat-return.v1.json | A return's model is checked against the meter |

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

- 2026-09-20 Onboarding cost measured for the first time: control-plane packet 38.3 KB of a 44 KB cap, AGENTS.md 11.6 KB of 12 KB, traps digest 11.5 KB and 30 per cent of the packet, headroom 24 traps against twenty added in three days. The board is not the grower; traps.yaml and sparks.json are, being the two stores in the reading path with no window. D-52 orders the remedy and D-53 records the orchestration model read from Otto and Virbos. T04 generalised from the host clock to any value not read in the same act as the write, which is the form that would have caught the T67 row.
- 2026-09-20 Sitting 9 absorbed S08 to S12 as T68 to T71 and the seat packet broke its 26 KB cap in the same act, which is D-52 arriving. Ceilings do not move: X01 is the first live experiment, suspending the packet budget step for 21 days on the hypothesis that the cap is right and the packet is wrong, with F36 the scoping lane that closes it. Six lanes queued in order; F33 and F34 run ALONE because every lane contends on governance surfaces (D-54). Envelope tool-call floor is 40. controlPlane is now the generic owner-selected rather than a vendor id.
- 2026-09-20 Control plane handed off. The board and factory/decisions.json carry everything this tenure learned, including the orchestration model read from Otto and Virbos (D-53) and the governance-maintenance model (D-54); nothing of it is left in the session. X01 is open and is the first exception this repository has taken on purpose rather than by decree.
- 2026-09-20 X01 opened and reverted the same day: it suspended a whole gate step to excuse one cap, switching off F31's prefix guard landed that morning. A suspension must not be wider than its hypothesis. The cap was cleared by compaction, and board.now now carries routing facts only, with the handoff in D-55, because the slice is in every seat's packet.
- 2026-09-20 Seat-packet cap raised 26 to 27 KB by D-56 after compaction failed to close a 0.5 KB gap, held at one KB headroom so the pressure stays. X01 was reverted first: a suspension must not be wider than its hypothesis. F36 brings the packet back under 26 by scoping a seat's traps to its Holds; the cap is not nudged again.
- function at() { [native code] } undefined
- function at() { [native code] } undefined
- function at() { [native code] } undefined
- function at() { [native code] } undefined
- function at() { [native code] } undefined
- function at() { [native code] } undefined
- function at() { [native code] } undefined
