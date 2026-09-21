ENVELOPE: <LANE> — <TITLE>
Authorization: this envelope, issued by the control plane. Read AGENTS.md, then BOARD.md, then factory/traps.yaml once. Then do the work. Nothing else is required reading.

Work
  <one line: a verb and an object>

Acceptance
  <what a command or the owner can prove>

Base
  <sha from git ls-remote origin refs/heads/main> — the commit the work is based on.
  The worktree is cut from the commit that CARRIES this envelope, which is that commit or a later
  one: a seat reads its envelope from its own worktree (T81). Rebase onto live main before push.
  Push the branch only.

Holds
  <paths this seat may write>
  Changed file set equals this list. A stray file is a stop.

Correction
  Include this section ONLY when the first line above reads ENVELOPE: <LANE> — CORRECTION <n> — ...
  A correction is written to main and the seat's worktree is rebased onto it (T81), so the lane
  branch has diverged from the tip it already pushed and this section is the only thing that
  authorises the push that follows. An envelope whose first line carries no CORRECTION carries no
  section.
    Pushing after a correction
      The rebase has diverged your branch from the tip you pushed. You are authorised to run
        git push --force-with-lease origin writer/<LANE>
      on YOUR LANE BRANCH ONLY. main is never forced and no other branch is yours to rewrite.
      If force-with-lease is itself rejected, stop and return: that means something else moved
      your branch.
  Substitute <LANE>. A correction is still one page: keep it under envelopeKb, trimming narrative,
  never this section. factory/tools/envelopeCheck.mjs refuses a correction envelope whose
  authorisation names any branch but its own, and refuses any envelope that authorises a force on
  main.

Must stay true
  <standing rules plus this lane>
  A false sentence in the diff is a blocking defect.

Verification
  <commands the reviewer re-runs>
  Paste counts from the command that produced them. Long jobs: detached log, rc marker, poll in the foreground, never end the turn between polls.

Look hardest at
  <the ways this lane usually lies>
  If this lane names a law, circular, IRR, RFC, or PDF: the control plane fetched it before issue. If this lane is a queue name: scopeSearch opened every container, including empty ones. Every sentence of the ruling is implementable in Holds. A tool-policy refusal is not a reason this envelope waits.

Runtime
  Stamp from factory/project.json (topology id, or local-hands | pc-token | pc-dashscope | cloud-git-bus | cloud-grok | cloud-dashscope | desktop-two-process | desktop-qwen | public-fork | team-shared | help-fork | help-collab).
  Writer seat only. Do not remap the control-plane session. Print-mode in the worktree.
  Hands: node factory/tools/hands.mjs. Never a model.
  Prefix: AGENTS, BOARD, this envelope, tools — byte-stable, first. Variable work last. Paste prompt_cache_hit_tokens or cached_tokens. Do not store answers.

Spend cap
  Tool calls: 40 for a lane of up to three files, more if the envelope says so (owner, 2026-09-20). A cap that a lane's own Holds cannot be satisfied within is a badly drawn cap, not a violation.
  <USD or turns, then stop and return>
  Hitting the cap is a return, not a hang. Escalation is a new envelope on a stronger seat.

Fuse
  Split on envelope done, correction cap, spend cap, or a named decay sign (factory/sessions.json).
  Successor reads AGENTS, BOARD, this envelope. Never the transcript. Never a compaction.
  A fresh same-tier instance beats a cheaper tired model finishing the job. On a decay sign: stop, print the signs, return.

Self-check
  Before returning, drive the list a reviewer of this lane would be given and fix what you find. Record in docs/log/<lane>.md what the self-check changed.

Return
  A few lines in docs/log/<lane>.md: what changed, the measuring command, no commit id of your own.

You run in print mode: the end of your turn is the end of your process, and nothing wakes you. Never end a turn waiting on a background task or a monitor; wait in the foreground with a bounded sleep loop, then print the full return.
