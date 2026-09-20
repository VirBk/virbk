# BOARD

Generated from `factory/board.json`. Do not hand-edit this file. Restamp with `node factory/tools/renderBoard.mjs`.

## Now

Sitting 2. F21 issued: shallow checkout for the landing gate. Local DashScope writer; references remain read-only.

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
| F15 | dropped | factory/tools/seat.mjs, docs/log/f15.md | Map hosted writer model to a real DashScope id |
| F16 | landed | factory/tools/seat.mjs, docs/log/f16.md | Hosted recipes print the live DashScope model id |
| F17 | landed | factory/project.json, factory/tools/seat.mjs, docs/log/f17.md | DashScope DeepSeek Flash on the live seat |
| F18 | landed | factory/sparks.json, factory/tools/sitting.mjs, factory/traps.yaml, docs/log/f18.md | Close F15; absorb S01 as T49; drop S02 |
| F19 | landed | .github/workflows/landing.yml, factory/landing-checks.json | Public-repo landing Action |
| F20 | landed | .github/workflows/writer.yml, factory/tools/ghaWriter.mjs | GitHub Action writer runner |
| F21 | issued | .github/workflows/landing.yml, docs/log/f21.md | Shallow checkout for the landing gate |

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

## Keystones

- Dual-runtime closed loop: spec → runtime-stamped envelope → cheap writer return → strong review → land → spend in the lane log
- Parent flywheel: copy → run → return intake → Grok absorbs under size budgets

## Shelf

- Kit overlay onto Otto or Virbos — trigger: Quiet week, no running seats, owner word. Pin a kit SHA. Never a GitHub fork.

## Ledger

- 2026-09-16 Factory opened. Otto and Virbos read-only. Working remote VirBk/Grok, previously empty.
- 2026-09-16 F0 landed. Kit on VirBk/Grok. Board is JSON. Waiting on owner specs.
- 2026-09-16 F1 spec landed: cheap writer seats, desktop and cloud. Dual-runtime named. Do not remap the CP session.
- 2026-09-16 F2 landed. Product paragraph is parent factory plus dual-runtime. Never-move: child does not write Grok.
- 2026-09-16 F4 landed. Lineage register, intake contract, intake gate. Otto and Virbos absorbed. Next child copies the kit.
- 2026-09-16 F5 landed. Session fuse. Git is memory. Compaction is not a briefing. Fresh same-tier instance after a split.
- 2026-09-16 F6 landed. Hands are a dumb runner. Claude Code optional. PM picks in project.json. Default topology local-hands.
- 2026-09-17 F7 landed. Owner console spec in factory/CONSOLE.md. Lean token mix. Control plane session retired.
- 2026-09-17 Virbos derivation miss absorbed. CONTROL_PLANE.md required for any control plane. scopeSearch on the landing gate. Intakes I09 I10 I11. Traps T32 T33 T34.
- 2026-09-17 Otto owner-wait absorbed. Closed ask list, hands launch, ruling-fits-hold, named checks. Intakes I12 I13 I14 I15. Traps T35 T36 T37 T38.
- 2026-09-17 Spark/waiver quarantine landed. factory/sparks.json look-not-law. factory/.waiver gitignored. sitting close. Intakes I16 I17. Traps T39 T40. S01 S02 open.
- 2026-09-17 F8 landed. Alumni drops for Otto and Virbos. Intake I18. Trap T41. Decision D-15. Overlay is a later envelope, not this sitting.
- 2026-09-17 F9 landed. access and commitCredit are catalog picks. Topologies public-fork and team-shared. Trap T42 T43. Decision D-16. Parent remains owner-only.
- 2026-09-17 F10 landed. Cloud isolate is git-bus or codespace. Topology cloud-git-bus. cloud-grok uses codespace+aider. Trap T44. Decision D-17. No GitHub Action. F3 still queued on a key.
- 2026-09-17 F11 landed. promptCache pick. Trap T45. Decision D-18. No answer store. Prefix law in the envelope stamp.
- 2026-09-17 F12 landed. Topologies pc-token, pc-dashscope, cloud-dashscope. Trap T46. Decision D-19. Token is the writer, never the control plane. F3 still queued on the key.
- 2026-09-17 F13 landed. helpMode pick. Topologies help-fork and help-collab. Isolate help-clone. Trap T47. Decision D-20. Virbos stays alumni. Overlay still shelf.
- 2026-09-17 F14 landed. PAYG Singapore. Owner ladder. Path auto native/DashScope. T clock + probe. D-21. F3 still queued on the keys.
- 2026-09-17 F3 issued. pc-dashscope. Path pinned dashscope until DEEPSEEK_API_KEY is in the seat. D-22. Writer is qwen-code, not this session.
- 2026-09-17 F3 landed. Writer qwen3-coder-plus on PAYG Singapore. Seat recipes use dashscope-intl. D-23. Catalog id qwen3-coder is not a DashScope API name.
- 2026-09-17 F15 issued. Catalog: qwen3-coder is Ollama-only. pc-dashscope and cloud-dashscope pick qwen3-coder-plus. Writer interpolates live writerModel. D-24.
- 2026-09-17 F15 split. Writer escaped JS ${writerModel}; recipes printed a placeholder. F16 issued on qwen3.7-plus. D-25.
- 2026-09-17 F16 landed. seat.mjs interpolates live writerModel (qwen3-coder-plus). F15 stays split. D-26.
- 2026-09-17 F17 landed. Same DASHSCOPE_API_KEY invokes deepseek-v4.1-flash. Hosted map: deepseek-flash → deepseek-v4.1-flash. Path stays dashscope until native credit posts. T48. D-27. F15 stays split.
- 2026-09-17 F18 landed. F15 dropped (superseded by F16/F17). S01 absorbed as T49. S02 dropped (T25). Sitting-class check on the landing gate. D-28.
- 2026-09-17 Otto drop after O38. Morning F8 WHEN stale (O38 issued). Intakes I19 I20. Traps T50 T51. D-29. Paste after O38 lands. Overlay still shelf.
- 2026-09-17 Otto drop rewritten. Evening file was more law, no check. Useful drop is size step on Otto landingChecks.yml plus archive under cap. D-29 superseded. D-30 T52 I21.
- 2026-09-17 Virbos drop rewritten. Morning file was more law, no check. Useful drop is size step on tools/check.yml plus archive under cap. D-31 T52 I21-both.
- 2026-09-17 Size archive is CP hygiene at 80% between landings. Script fails; it does not split. First alumni cut is Now-only. D-32 T53 I22.
- 2026-09-17 S06 opened. Session confirmation is not a hold. Reading files or alumni does not bind the next sentence. Look, not law.
- 2026-09-17 Owner reversed D-09. Original CP loop has no hands actor. F6 third seat is regression. D-33. D-04 stands.
- 2026-09-17 D-35. Closed owner concerns recorded in factory/concerns.json. Plan remains packages.json. Conversation not stored. F7 outcomes stood; the questions did not.
- 2026-09-18 F19 landed. Owner: public repo. Landing Action runs the gate on ubuntu. No writer secret. Writer runner stays shelf. D-36.
- 2026-09-18 F20 landed. Owner placed DASHSCOPE_API_KEY. Writer Action idles green; launches qwen-code on an envelope; never pushes main. D-37 T55.
- 2026-09-20 F21 issued after owner review of PR #3. Local qwen-code writer on deepseek-v4.1-flash. Records issuance skips Actions to prevent a duplicate writer; final landing requires the full gate.
