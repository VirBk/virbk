# Control-plane derivation

Required reading for the control plane — Grok in the cloud or Claude Code on the desktop. Not required for a writer seat. A successor that will issue, stamp, drop, or wait reads this with AGENTS, BOARD, traps, and `factory/sparks.json` (look, not law).

The method is exhaustive on containers and issuances. It does not wait on the owner for a click. It is not a long essay.

## 1. A ZERO names every container

Before “nowhere”, “no scope”, “drop them”, or “not in the repository”:

```
node factory/tools/scopeSearch.mjs TOKEN
```

The command prints **every** container, including the empty ones. An empty container you named is evidence. One you did not open is not.

Closed list: `board-now`, `board-rest`, `docs`, `source`, `tests`, `other`.

A markdown-only grep of the queue line is a miss. The scope lived in the same board, further down, and in source. The stamp said ZERO. The objects did not.

A hosted or private-index code search that returns zero is not a ZERO: the search product is not a container. Open the containers.

A suffix that is wave vocabulary is reconstructed from the table that defined the wave. The last stamp is a lead. Re-derive against the objects.

## 2. A named issuance is a fetch, not an ask

If the record names a law, circular, IRR, RFC, or PDF: retrieve it. Quote the section. Record the URL.

Ask the owner only when the document cannot be found, or sits behind a closed gate. “Blocked on the citation” with no fetch is a diary.

An agency still collecting is a **second fact**. It does not erase the statute. Stamp both.

## 3. The owner-ask list is closed

Source: `factory/owner-ask.json`. Ask, in one line, only what it names. Everything else is a control-plane act or a split.

A **tool-policy refusal is not an owner ask.** Order:

1. Run the binary underneath the refused wrapper.
2. Launch the writer from this session (`node factory/tools/seat.mjs recipe`). Do not add a third actor (D-33).
3. Print the one-line command, split the session, leave.

Do not wait. Do not rephrase a double-click as a decision. A recommendation already made is recorded and acted on; it is not re-asked.

Carving “anything the session’s tool permissions refuse” out of a default-yes so that it waits on the owner is the hours-of-delay miss. The factory refuses that carve-out.

## 4. A ruling must fit the hold

Before issue: every sentence of the ruling is implementable in the named holds. A ruling that cannot is a control-plane defect. Split it. Do not issue a lane whose other half is “owed.”

## 5. Name which check covered what

A green gate is evidence about the steps it ran. It is not evidence about a suite it does not contain. The landing line names the gate, and names the integration run or names that it did not run.

A seat return that looks like a drive is a lead until the control plane runs one command at the objects. Stamping it into the register without that command is a miss.

## 6. This is not a cheap-model problem

A strong control plane that waits is still a wait. Remapping it onto a cheaper model does not launch a refused seat and makes a ZERO more likely. Keep the control plane on Grok or Opus. Cut the write. Hands launch. Idle seats stay idle.

## 7. Sparks and waivers

A eureka that is not yet a trap is a **spark**. Mid-sitting:

```
node factory/tools/spark.mjs add --kind trap --claim "..." --object path --why "..."
```

Successor **looks** at `factory/sparks.json`. It does not obey it. Absorbing is an envelope with a check. Dropping names because. An open spark older than one sitting fails the landing gate.

A session-only approval is a **waiver**. Envelope holds, or gitignored `factory/.waiver`. Never AGENTS, never traps, never BOARD. Last act:

```
node factory/tools/sitting.mjs close
```

Waivers expire. Sitting increments. A tracked `.waiver` fails the gate. A spark that would weaken AGENTS §5 is refused.

Do not write `handoff.md`. The tired session quarantines. The fresh session writes law.

Otto and Virbos are alumni. A paste in `factory/drops/` is for that product's control plane after its running seats finish. It is not a kit overlay. Helping them is a sidecar child (`help-fork` / `help-collab`), never this sitting as their control plane. A drop that does not name a check that product's gate already runs is pain. Do not grow an over-cap live file. The size script fails; it does not split. Archive at 80% is a records commit between landings. A keystone does not wait on it.

## 8. Cloud isolate

This session is not a terminal and does not become the writer. Claude Code absent is the default. The owner's token is the writer. The control plane launches that seat (D-33). `hands.mjs` is optional leftover, not the loop.

Autobuild PC on: envelope blob is the deploy; this session isolates and prints the recipe.

Autobuild PC off: isolate is a Codespace. Print `gh codespace create`. Writer token is a Codespaces secret, placed once (owner-ask: writer API keys). Do not add a GitHub Action until that secret exists.

Cursor local Chat/Agent may BYOK. Cursor cloud, background, automations, and CLI cannot.

## 8b. The packet, the window, the scan

Issue with a packet, not with a pile. `node factory/tools/packet.mjs seat
<LANE>` is the seat's whole reading path and prints its byte count;
`cp` prints yours. The gate fails a packet over the budget in
`factory/budgets.json` and an envelope over one page.

Restamp, then `node factory/tools/ledger.mjs rotate`. History goes to
`docs/ledger/`. A seat never reads it.

Before a drop, measure: `node factory/tools/alumni.mjs drop-status <child>
<path>`. Not adopted is a fact, not a nudge. Before an intake is absorbed,
it names the law it became (`absorbedAs`), and
`node factory/tools/alumni.mjs provenance` prints the chain.

## 9. Exhaustive, not long

Open the named document. Open the containers. Quote. Launch or leave. Spark or drop. Stop. Do not start a study. Do not fill a seat because a slot is empty. Do not drop a name you have not searched in source. Do not write a handoff.md.

## 10. The repository is the record

Private session notes, Claude memory, and `handoff.md` files are not.
Before a fact or an owner ask, find it on the newest board section, the
register, or git. Read the check's output before writing the report.
Older board sections keep asks that newer ones closed; the newest entry
decides.

A closed keystone list is read at issue. Every writer envelope names the
keystone or names its absence. Recent envelopes that skipped the ask are
not precedent.

## 11. Check

- `node factory/tools/scopeSearch.mjs --self-test`
- `node factory/tools/ownerAsk.mjs --self-test`
- `node factory/tools/spark.mjs --self-test`
- `node factory/tools/kitCheck.mjs --self-test`
- `node factory/tools/packet.mjs --self-test`
- `node factory/tools/ledger.mjs --self-test`
- `node factory/tools/alumni.mjs --self-test`
- `node factory/tools/seatReturn.mjs --self-test`

A `blocked-on-issuance` stamp without a fetch URL is a diary. A wait whose reason is `Start-Process` is a diary. A eureka that exists only in the transcript is a diary. A fact taken from session notes is a diary. A keystone envelope that does not name the keystone is a diary. A drop whose adoption nobody measured is a diary. A return with no pasted command is a diary.
