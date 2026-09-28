# Round protocol

Not a handoff. A successor reads AGENTS.md, BOARD.md, and the envelope. It does not read this file. Do not write handoff.md. A seat's packet does not include this file or `factory/roles/`.

This file names the loop the repository already runs. It does not add a role, a cap, or a lane. AGENTS.md and `factory/OPERATING_MODEL.md` win where this disagrees.

## Loop

Authorize, isolate, build, review, land, record.

A code envelope gets one review, behaviour and coherence together. A records envelope gets none. Corrections stay with the writer, same session. Sweep: one correction, then split. Keystone: two, then split. No third round. A split is a new envelope, not another pass in this lane.

## Who runs

| Role | When | Session |
| --- | --- | --- |
| Writer | No return yet | The writer seat. `node factory/tools/seat.mjs` |
| Reviewer | A code return is in and has no verdict | Fresh. Never the author. `factory/templates/REVIEW.md` |
| Corrector | CHANGES REQUESTED, and the cap is not spent | The same writer session |
| Challenger | Named keystone, owner's word, not yet run | Fresh, empty resume. Leads, not a verdict. Never Fable |
| Land | Approved, and the challenge if it was asked | The control plane. This tool does not land |
| Split | Changes requested at the cap | Stop. New envelope |

## Round card

The envelope is a one-page git blob, `factory/templates/ENVELOPE.md`, checked by `factory/tools/envelopeCheck.mjs`, deleted on land. The return is `contracts/seat-return.v1.json`.

`factory/round.schema.json` is not an envelope. It is the card the control plane holds while a lane is open, so the cap is a check instead of a sentence nobody re-reads. It carries no findings, no transcript, and no model name. The model is stamped on the envelope from `factory/project.json` and `factory/runtimes.json`.

```
node factory/orchestrator.mjs status <card.json>
node factory/orchestrator.mjs next <card.json>
node factory/orchestrator.mjs check <card.json>
node factory/orchestrator.mjs advance <card.json> <event>
```

Events: `writer_returned`, `review_approved`, `review_changes`, `correction_returned`, `challenge_returned`, `landed`.

The orchestrator does not call a model, does not read a key, does not push, and does not fast-forward. A runner that called a model would be a third seat (D-33). Hands stay `factory/tools/hands.mjs`. There is no adapter.

## What the card refuses

The tiers are sweep, keystone, and records. There is no ordinary tier, no trivial tier, and no experimental tier.

The cap is not a field. Sweep is 1. Keystone is 2. Records is 0. A card that brings its own cap is rejected.

A challenge is not required every round, and it is not a blocking verdict. It runs only when the tier is keystone, the card says named, and the owner said so. Leads do not hold a landing.

The catalog has no reasoning_effort. Sweep writer is `deepseek-flash`. Keystone writer is `deepseek-v4-pro`. A reviewer is never weaker than the writer and never the writer. `deepseek-reasoner` is not a catalog id.

A review starts with `VERDICT: APPROVED` or `VERDICT: CHANGES REQUESTED`. There is no CLEAN line and no BLOCKING tag.

Prompts: `factory/roles/`.
