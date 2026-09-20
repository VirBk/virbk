# Owner console

Live surface the owner walks. Spec, not a writer envelope. Control plane wrote it. The running app is the Grok App Builder project named GROK Factory. Kit memory is this repository.

## Setup

1. Floor — local machine or cloud.
2. Remote — GitHub owner/repo. Empty owner is filled by the session as VirBk. Children never write VirBk/virbk.
3. Seats — control plane is Grok (this session, wired) or Claude desktop. Writer is local Qwen, DeepSeek Flash, DeepSeek V4 Pro, or an own model. Keys never enter git. Never a `VITE_` variable. Do not remap this session onto a writer token. Cursor Cloud Agents cannot take that token.
4. Name — local folder `~/factory/<slug>`. Cloud codespace `grok-<lane>`, not the owner's disk. git-bus reuses the PC that already autobuilds.
5. Charge — objective, goals, spec, expected result. Becomes the first envelope.
6. Bench — install plan for that floor. Prepare writes `factory.project.json`, `SPEC.md`, `install.sh`, `.env.example`. The preview cannot apt-install on the laptop; the owner runs the script on the machine that hosts hands.
7. Contribute — who may land, and which email GitHub attributes. Live picks `access` and `commitCredit`. Parent default is owner-only + owner-account. `public-fork` or `team-shared` when this repo is the product. A collaborator is write access. A contributor is a landed commit with an email on a GitHub account.
8. Help — to add a complementary factory onto an ongoing product (example: Virbos), copy the kit into a **new empty remote**. `apply-topology help-fork` (no write on the target) or `help-collab` (invited write). Write `factory/help.json` from `factory/help.example.json`. Isolate clones the target as a sibling. PRs are product files only. This factory never lands the target's main, never overlays `factory/` onto alumni, never writes VirBk/virbk, never runs as control plane of Grok and the target in one sitting. Overlay stays shelf.

## Floor

Local and cloud are lenses. The path mark sits on the floor this project uses. The other lens stays queued.

Cloud control plane stays Grok. It deploys a terminal; it is not the writer.

- Autobuild PC on — topology `cloud-git-bus`. Envelope blob is the deploy. That machine runs `node factory/tools/hands.mjs watch` then isolate/recipe. Same Qwen/DeepSeek harness as local.
- Autobuild PC off — topology `cloud-grok`. Isolate is a Codespace. Writer is aider pointed at DeepSeek or Qwen. Token is a Codespaces secret, placed once. `hands.mjs isolate` prints `gh codespace create`. Not a GitHub Action.
- Cursor — optional local Chat/Agent BYOK only. Cloud Cursor is not a writer seat.

The chassis is the product dashboard as it is built. Landed tiles take a click. Framing and planned tiles stay visible, locked, not clickable.

## Token only (no Claude Code)

Claude Code absent is the default, not a defect. The token is the writer. Grok (this chat) is still the control plane. Do not remap this session onto the token. Original loop has no hands actor (D-33). This session launches the writer.

PC, DeepSeek token:

```
node factory/tools/hands.mjs apply-topology pc-token
export DEEPSEEK_API_KEY=...
node factory/tools/hands.mjs isolate --lane <ID> --base <sha>
node factory/tools/hands.mjs recipe
```

PC, DashScope token: `apply-topology pc-dashscope`, then `DASHSCOPE_API_KEY`.

Cloud, DeepSeek: `apply-topology cloud-grok`. Place the key as a Codespaces secret once. `isolate` prints `gh codespace create`.

Cloud, DashScope: `apply-topology cloud-dashscope`. Same secret rule.

Do not install Claude Code or Cursor to spend the token. Do not add a GitHub Action while the secret is missing.

## Token mix

Save on the write. Do not save on judgment.

Required: issue envelope (control plane, packet not dump), isolate/gate/land (hands, no model), one sweep writer, review (never the author, never weaker), keystone writer only when the control plane names that lane.

Lean: about 85% sweep, 15% keystone, review every loop, hands at zero tokens. Apply lean writer does not remap the control plane.

Prompt cache is native. DeepSeek, Grok, and Qwen already cache a matching prefix. Local Ollama/vLLM reuse a KV prefix. The factory does not store answers. It keeps AGENTS, BOARD, envelope, and tools byte-stable at the front, variable work last, and pastes hit tokens. Pick `promptCache` in `factory/project.json` (`local-kv` on the autobuild PC, `provider-prefix` on hosted writers).

Forbidden cuts: remap this control plane onto DeepSeek or Qwen; skip review; writer reviews itself; skip the landing gate; staff local and cloud on the same lane; put a clock in the cached prefix.

## Writer ladder

Meter is DashScope PAYG (Singapore). Not Token Plan. Not provisioned throughput.

The owner picks the model, flagship down to the still-acceptable floor:

- Qwen: qwen3.8-max, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3.7-flash
- DeepSeek: deepseek-v4-pro, deepseek-flash

Path:

- `auto` — native DeepSeek off-peak if healthy; DashScope PAYG on peak (01:00–04:00 and 06:00–10:00 UTC, weekday) or if native does not answer. Qwen is always DashScope.
- `native` — pin api.deepseek.com. Peak rates stand. Outage still fails over.
- `dashscope` — pin Model Studio PAYG.

```
node factory/tools/route.mjs resolve
node factory/tools/route.mjs peak
node factory/tools/route.mjs probe
```

Place `DASHSCOPE_API_KEY` for Qwen and for DeepSeek failover. Place `DEEPSEEK_API_KEY` to take native off-peak. Never git, never `VITE_`.

## What landed

BOARD.md, generated from `factory/board.json`. This file does not keep a second copy of lane state; a stale copy is what made the owner ask twice.

## What a sitting costs

```
node factory/tools/packet.mjs cost
node factory/tools/alumni.mjs scan <path>
node factory/tools/alumni.mjs drop-status <child> <path>
```

The first prints the reading path every seat pays for and the cut the
packet makes. The second measures any product repository, read-only, and
maps each signal to the trap that paid for it. The third says whether an
alumni drop was adopted.

## Successor

Read `AGENTS.md`, `BOARD.md`, `factory/traps.yaml` once. Closed concerns: `factory/concerns.json`. Plan: `factory/packages.json`. Look at `factory/sparks.json` (look, not law). A control plane that will issue or drop also reads `factory/CONTROL_PLANE.md`. The owner-ask list is `factory/owner-ask.json`. Git is memory. There is no handoff.md. Compaction is not a briefing. Last act: `node factory/tools/sitting.mjs close`.
