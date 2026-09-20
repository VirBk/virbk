# Copy this factory

The kit is the thing you copy. The product is not. Grok stays the parent.

## Do

1. Copy `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, and the `factory/` directory into the new repository.
2. Copy `contracts/` (schemas, not a child's board) and empty `docs/log/`.
3. Start a new `factory/board.json` and an empty `docs/ledger/`. Do not copy BOARD contents, ledger novels, or any `SESSION_LOG`. Start a new `factory/sparks.json` (sitting 1, empty items). Do not copy a parent's open sparks.
4. Keep `factory/lineage.json` as the parent register. Do not append this child's board to it.
5. Copy `factory/project.json`. Pick writer harness, isolate, `access`, `commitCredit`, `promptCache`. The control plane launches the writer (D-04, D-33). A `hands.mjs` check is not a copy gate. Claude Code absent is the default. Token-only is `pc-token` or `cloud-grok`. A child never writes VirBk/virbk.
6. Fill AGENTS §1 with one product paragraph whose acceptance is an owner walk of a closed loop.
7. Add the product’s never-move rules to AGENTS §5. Keep: a child never writes VirBk/virbk.
8. Name keystones and single-writer holds on the board. Closed lists.
9. Name gates. G0 is synthetic only. No envelope opens a gate.
10. Point `factory/landing-checks.json` at this stack’s real commands.
11. Score the empty factory against `factory/ASSESSMENT.md`. Below 8 is a kit defect. Fix the kit first.
12. Wait for a spec. Idle is success.
13. When this child pays for a lesson, file an intake (`factory/templates/INTAKE.md`). Validate with `node factory/tools/intake.mjs`. Absorbing is a Grok envelope.
14. Print the reading path before the first envelope: `node factory/tools/packet.mjs cost`. The gate fails it over budget. Issue with `packet.mjs seat <LANE>`, not with a pile of files.
15. Scan the fresh copy: `node factory/tools/alumni.mjs scan .`. A signal in an empty child is a kit defect, not a child defect. Fix the kit.
16. Take the check pack: `node factory/tools/alumni.mjs checks`. It prints every gate step and who paid for the law behind it. `provenance` prints the chain from a trap back to the child that charged for it.
17. A control plane that will issue or drop reads `factory/CONTROL_PLANE.md`. A ZERO that did not name its containers is not a finding. A tool-policy refusal is not an owner ask. A eureka is a spark, not a trap. A session-only waiver is not git.

Writer seats: `node factory/tools/seat.mjs recipe`. The control plane launches. Do not remap the control-plane session. A third hands actor is not the loop (D-33). Sessions are a fuse: `factory/sessions.json`. Do not brief a successor from a transcript.

## Do not

- Copy Otto or Virbos product code, boards, or session logs.
- Retrofit Otto or Virbos as live children. They are alumni. They take `factory/drops/<name>.md` after running seats finish. The next child is an empty remote. Helping them is a sidecar (`help-fork` / `help-collab`), not an overlay.
- Start a documentation lane to “bring the docs over.”
- Type counts into README.
- Open a second remote on the same repo. A sidecar clone of the help target is a sibling directory, not origin-2.
- Land the help target's main from this factory.
- Put `factory/` files in a product PR.
- Run one sitting as control plane of Grok and Virbos (or any help target) together.
- Fill seats because they exist.
- Install Claude Code in order to run this kit.
- Give `hands.mjs` a model or an API key.
- Push to VirBk/virbk from this child.
- Merge this child's BOARD into the parent.

## After the first landing

Run `node factory/tools/landingGate.mjs` from a fresh archive of the commit. If the gate cannot parse its checks from that archive, it fails — it does not fall back to this tree.
