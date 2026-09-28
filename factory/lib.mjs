// Round-card policy for the loop AGENTS.md already runs.
// No model calls. No keys. No git. No I/O.
// The envelope stays factory/templates/ENVELOPE.md. This is not a second one.

export const LANE_CAPS = {
  sweep: 1,
  keystone: 2,
  records: 0,
};

export const ROLE_FILES = {
  writer: "factory/roles/writer.md",
  reviewer: "factory/roles/reviewer.md",
  challenger: "factory/roles/challenger.md",
  corrector: "factory/roles/corrector.md",
};

export const TIERS = ["sweep", "keystone", "records"];

export const STATES = [
  "awaiting_writer",
  "awaiting_review",
  "awaiting_correction",
  "awaiting_challenge",
  "ready_to_land",
  "landed",
  "split",
];

export const VERDICTS = [null, "APPROVED", "CHANGES REQUESTED"];

const FIELDS = [
  "lane",
  "tier",
  "keystone",
  "ownerChallenge",
  "challengeDone",
  "correctionsUsed",
  "state",
  "verdict",
];

export function capFor(card) {
  if (!card || !Object.hasOwn(LANE_CAPS, card.tier)) return null;
  return LANE_CAPS[card.tier];
}

export function challengeRequired(card) {
  return card.tier === "keystone"
    && card.keystone === "named"
    && card.ownerChallenge === true
    && card.challengeDone !== true;
}

export function nextRole(card) {
  switch (card.state) {
    case "awaiting_writer":
      return { role: "writer", reason: "no return yet" };
    case "awaiting_review":
      if (card.tier === "records") {
        return { role: "land", reason: "a records envelope gets no review" };
      }
      return { role: "reviewer", reason: "fresh session, never the author" };
    case "awaiting_correction": {
      const cap = capFor(card);
      if (cap == null || card.correctionsUsed >= cap) {
        return { role: "split", reason: "correction cap reached; no third round" };
      }
      return { role: "corrector", reason: "same writer session" };
    }
    case "awaiting_challenge":
      if (!challengeRequired(card)) {
        return { role: "land", reason: "no owner challenge on a named keystone" };
      }
      return { role: "challenger", reason: "leads, not a verdict; fresh empty resume" };
    case "ready_to_land":
      return { role: "land", reason: "control plane lands; this tool does not" };
    case "landed":
      return { role: "none", reason: "landed" };
    case "split":
      return { role: "split", reason: "new envelope, not another round" };
    default:
      throw new Error("unknown state: " + card.state);
  }
}

export function decide(card) {
  const n = nextRole(card);
  return { role: n.role, reason: n.reason, prompt_file: ROLE_FILES[n.role] ?? null };
}

export function advance(card, event) {
  const cap = capFor(card);
  if (event === "writer_returned" && card.state === "awaiting_writer") {
    return {
      ...card,
      verdict: null,
      state: card.tier === "records" ? "ready_to_land" : "awaiting_review",
    };
  }
  if (event === "review_approved" && card.state === "awaiting_review") {
    const next = { ...card, verdict: "APPROVED" };
    next.state = challengeRequired(next) ? "awaiting_challenge" : "ready_to_land";
    return next;
  }
  if (event === "review_changes" && card.state === "awaiting_review") {
    const spent = cap == null || card.correctionsUsed >= cap;
    return {
      ...card,
      verdict: "CHANGES REQUESTED",
      state: spent ? "split" : "awaiting_correction",
    };
  }
  if (event === "correction_returned" && card.state === "awaiting_correction") {
    return {
      ...card,
      correctionsUsed: card.correctionsUsed + 1,
      verdict: null,
      state: "awaiting_review",
    };
  }
  if (event === "challenge_returned" && card.state === "awaiting_challenge") {
    return { ...card, challengeDone: true, state: "ready_to_land" };
  }
  if (event === "landed" && card.state === "ready_to_land") {
    return { ...card, state: "landed" };
  }
  throw new Error("cannot " + event + " from " + card.state);
}

export function check(card) {
  const errors = [];
  if (!card || typeof card !== "object" || Array.isArray(card)) return ["card missing"];
  for (const key of Object.keys(card)) {
    if (!FIELDS.includes(key)) errors.push("unknown field " + key);
  }
  if (typeof card.lane !== "string" || card.lane.length === 0) errors.push("missing lane");
  if (!TIERS.includes(card.tier)) errors.push("tier is not sweep, keystone, or records");
  if (card.keystone !== "named" && card.keystone !== "absent") {
    errors.push("keystone must be named or absent");
  }
  if (card.tier !== "keystone" && card.keystone === "named") {
    errors.push("only a keystone tier may name a keystone");
  }
  if (typeof card.ownerChallenge !== "boolean") errors.push("ownerChallenge must be boolean");
  if (typeof card.challengeDone !== "boolean") errors.push("challengeDone must be boolean");
  if (!Number.isInteger(card.correctionsUsed) || card.correctionsUsed < 0) {
    errors.push("correctionsUsed must be a non-negative integer");
  }
  if (!STATES.includes(card.state)) errors.push("unknown state");
  if (!VERDICTS.includes(card.verdict)) {
    errors.push("verdict must be null, APPROVED, or CHANGES REQUESTED");
  }

  const cap = capFor(card);
  if (cap != null && Number.isInteger(card.correctionsUsed) && card.correctionsUsed > cap) {
    errors.push("correctionsUsed " + card.correctionsUsed + " exceeds cap " + cap);
  }
  if (card.tier === "records" && card.correctionsUsed !== 0) {
    errors.push("records has no correction round");
  }
  if (card.tier === "records" && card.verdict != null) {
    errors.push("a records envelope gets no review");
  }
  if (card.tier === "records" && card.ownerChallenge === true) {
    errors.push("records does not take a challenge");
  }
  if (
    card.tier === "records"
    && ["awaiting_review", "awaiting_correction", "awaiting_challenge"].includes(card.state)
  ) {
    errors.push("records does not enter review");
  }
  if (card.ownerChallenge === true && !(card.tier === "keystone" && card.keystone === "named")) {
    errors.push("ownerChallenge requires a named keystone");
  }
  if (
    card.challengeDone === true
    && !(card.tier === "keystone" && card.keystone === "named" && card.ownerChallenge === true)
  ) {
    errors.push("challenge ran without a named keystone and the owner's word");
  }
  if (card.state === "awaiting_writer" && (card.correctionsUsed !== 0 || card.verdict !== null)) {
    errors.push("awaiting_writer is a new lane: no verdict, no corrections used");
  }
  if (card.state === "awaiting_review" && card.verdict !== null) {
    errors.push("awaiting_review has no verdict yet");
  }
  if (card.state === "awaiting_correction") {
    if (card.verdict !== "CHANGES REQUESTED") errors.push("a correction follows CHANGES REQUESTED");
    if (cap != null && card.correctionsUsed >= cap) errors.push("awaiting a correction past the cap");
  }
  if (card.state === "awaiting_challenge") {
    if (card.verdict !== "APPROVED") errors.push("a challenge follows APPROVED");
    if (card.challengeDone === true) errors.push("challenge already returned");
    if (card.tier !== "keystone" || card.keystone !== "named" || card.ownerChallenge !== true) {
      errors.push("awaiting a challenge the owner did not ask for");
    }
  }
  if (card.state === "ready_to_land" || card.state === "landed") {
    if (card.tier === "records") {
      if (card.verdict !== null) errors.push("records lands with no verdict");
    } else if (card.verdict !== "APPROVED") {
      errors.push(card.state + " requires verdict APPROVED");
    }
    if (
      card.tier === "keystone"
      && card.keystone === "named"
      && card.ownerChallenge === true
      && card.challengeDone !== true
    ) {
      errors.push("owner asked for a challenge and it has not run");
    }
  }
  if (card.state === "split" && card.verdict !== "CHANGES REQUESTED") {
    errors.push("split follows CHANGES REQUESTED past the cap");
  }
  return errors;
}
