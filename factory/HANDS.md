# Hands

Not required reading for a seat. The seat reads AGENTS, BOARD, envelope.

The control plane is judgment. Hands are a runner that does not call a model and does not read API keys. Claude Code is an optional pair of hands, not the product.

## Project manager pick

Live values: `factory/project.json`. Allowed ids: `factory/runtimes.json` `catalog`. Named bundles: `topologies`.

```
node factory/tools/hands.mjs pick
node factory/tools/hands.mjs apply-topology local-hands
node factory/tools/hands.mjs apply-topology pc-token
node factory/tools/hands.mjs apply-topology pc-dashscope
node factory/tools/hands.mjs apply-topology cloud-grok
node factory/tools/hands.mjs apply-topology cloud-dashscope
node factory/tools/hands.mjs apply-topology cloud-git-bus
node factory/tools/hands.mjs apply-topology public-fork
node factory/tools/hands.mjs apply-topology team-shared
node factory/tools/hands.mjs apply-topology help-fork
node factory/tools/hands.mjs apply-topology help-collab
node factory/tools/hands.mjs check
```

`access` is who may produce a landed commit. `commitCredit` is which email GitHub attributes. `promptCache` is native prefix reuse. `helpMode` is `none` (this repo is the product) or a sidecar (`fork-and-pr`, `collaborator-branch`). Parent live picks stay `helpMode` `none`. A child never writes VirBk/virbk. A sidecar never lands the target's main.

Change one field after applying a topology. `check` fails an unknown id. Mixes are allowed; unknown ids are not.

Recommended default on a PC with local Qwen: `local-hands`. Token only, no Claude Code: `pc-token` (DeepSeek) or `pc-dashscope`. Cloud token: `cloud-grok` or `cloud-dashscope`. Cloud CP with the autobuild PC still on: `cloud-git-bus`.

Optional: `desktop-two-process` if the manager already runs Claude Code. `cursor-desktop` is the same class. Do not install either to spend a writer token. Cursor Cloud Agents cannot take that token.

## Commands

```
node factory/tools/hands.mjs isolate --lane F3 --base <sha>
node factory/tools/hands.mjs envelope --lane F3
node factory/tools/hands.mjs recipe
node factory/tools/hands.mjs gate --sha <sha>
node factory/tools/hands.mjs land --lane F3 --sha <sha>
node factory/tools/hands.mjs watch
```

`isolate` with `worktree` or `git-bus` cuts a sibling directory (`git-bus` fetches first). With `codespace` it prints `gh codespace create` and does not touch the owner's disk. With `help-clone` it prints a sibling clone of `factory/help.json` `target`. With `cloud-clone` it prints a generic VPS clone.
`watch` lists issued envelopes and prints isolate/recipe, or `idle`.

`land` with `ff-only` fast-forwards. With `github-rebase-after-approved` it prints the merge and exits; a GitHub Action is not added until a writer secret exists.

Envelope path: `factory/envelopes/<lane>.md`. Writer recipes: `node factory/tools/seat.mjs recipe <writerHarness>`.
