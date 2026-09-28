# Roles

System prompts for a fresh session's system slot. A seat's packet does not include this directory. Where a prompt disagrees with AGENTS.md or `factory/OPERATING_MODEL.md`, those win.

The envelope is `factory/templates/ENVELOPE.md`. The review envelope is `factory/templates/REVIEW.md`. The return shape is `contracts/seat-return.v1.json`. The round card is `factory/HANDOFF_PROTOCOL.md`. It is not a second envelope.

| Role | Prompt | Sweep | Keystone |
| --- | --- | --- | --- |
| Writer | `writer.md` | `deepseek-flash` | `deepseek-v4-pro` |
| Reviewer | `reviewer.md` | never weaker than the writer, never the writer | never weaker than the writer, never the writer |
| Challenger | `challenger.md` | not seated | owner's word only; leads; never Fable |
| Corrector | `corrector.md` | the same writer session | the same writer session |

Catalog ids live in `factory/runtimes.json`. The live writer pick is `factory/project.json`. There is no reasoning_effort field. Sweep versus keystone is the model id, not an effort knob. The hosted sweep id is `deepseek-v4.1-flash`. The hosted keystone snapshot is `deepseek-v4-pro-0813`. Do not send a native id to the other host.

A reviewer model is stamped on the review envelope for that sitting. Rows in `factory/decisions.json` that seat a reviewer expire with the sitting that wrote them. Do not inherit one.

The corrector is not a model change. The challenger is not a catalog writer id.
