# Intake — return a lesson to Grok

A child files one of these when it paid for a trap, a lesson, or a practice. Absorbing it is a Grok envelope. The child does not write VirBk/virbk.

Validate before sending:

```
node factory/tools/intake.mjs path/to/intake.json
```

Shape: `contracts/intake.v1.json`.

```
INTAKE: <ID> — <TITLE>
Child: <repo>
Kind: trap | lesson | practice
Portable: portable | machine | reject

Charged
  <one sentence: what it cost, in time or money or a landed defect>

Rule
  <one sentence the next seat can follow>

Check
  <the command, gate step, or envelope hold that would catch a repeat>
```

Refuse if this is a child's BOARD, a SESSION_LOG, a copied count, or real data.

A rule with no check is a diary. Do not file it.

Same title or same rule as an absorbed row is a merge of the charge, not a new row.

Machine-only rows stay labeled machine. They do not enter traps.yaml as portable.
