import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANE_CAPS, advance, check, decide } from "./lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const orch = join(root, "factory/orchestrator.mjs");

function card(over) {
  return {
    lane: "example",
    tier: "sweep",
    keystone: "absent",
    ownerChallenge: false,
    challengeDone: false,
    correctionsUsed: 0,
    state: "awaiting_writer",
    verdict: null,
    ...over,
  };
}

function run(args, body) {
  const dir = mkdtempSync(join(tmpdir(), "round-"));
  const path = join(dir, "card.json");
  writeFileSync(path, JSON.stringify(body));
  const out = execFileSync(process.execPath, [orch, ...args, path], {
    encoding: "utf8",
    cwd: root,
  });
  return { out, path };
}

function runFail(args, body) {
  const dir = mkdtempSync(join(tmpdir(), "round-"));
  const path = join(dir, "card.json");
  writeFileSync(path, JSON.stringify(body));
  const r = spawnSync(process.execPath, [orch, ...args, path], { encoding: "utf8", cwd: root });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /FAIL/);
}

test("caps match AGENTS.md, not the draft", () => {
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Sweep-tier: one correction, then split/);
  assert.match(agents, /Keystone: two, then split/);
  assert.match(agents, /A records envelope gets none/);
  assert.equal(LANE_CAPS.sweep, 1);
  assert.equal(LANE_CAPS.keystone, 2);
  assert.equal(LANE_CAPS.records, 0);
});

test("schema tiers are the repository's, and the cap is not a field", () => {
  const schema = JSON.parse(readFileSync(join(root, "factory/round.schema.json"), "utf8"));
  assert.deepEqual(schema.properties.tier.enum, ["sweep", "keystone", "records"]);
  assert.equal(schema.properties.correction_cap, undefined);
  assert.equal(schema.additionalProperties, false);
});

test("open card → writer, and the prompt file is real", () => {
  const { out } = run(["next"], card());
  const decision = JSON.parse(out);
  assert.equal(decision.role, "writer");
  assert.equal(decision.prompt_file, "factory/roles/writer.md");
  assert.equal(decide(card()).role, decision.role);
  assert.equal(existsSync(join(root, decision.prompt_file)), true);
});

test("code return → reviewer, not a challenge", () => {
  const body = card({ state: "awaiting_review" });
  const decision = JSON.parse(run(["next"], body).out);
  assert.equal(decision.role, "reviewer");
  assert.equal(decision.prompt_file, "factory/roles/reviewer.md");
});

test("sweep: one correction, then split", () => {
  let body = card();
  body = advance(body, "writer_returned");
  body = advance(body, "review_changes");
  assert.equal(body.state, "awaiting_correction");
  assert.equal(JSON.parse(run(["next"], body).out).role, "corrector");
  body = advance(body, "correction_returned");
  assert.equal(body.correctionsUsed, 1);
  body = advance(body, "review_changes");
  assert.equal(body.state, "split");
  assert.equal(JSON.parse(run(["next"], body).out).role, "split");
  assert.equal(JSON.parse(run(["next"], body).out).prompt_file, null);
});

test("keystone: two corrections, then split", () => {
  let body = card({ tier: "keystone", keystone: "named" });
  body = advance(body, "writer_returned");
  body = advance(body, "review_changes");
  body = advance(body, "correction_returned");
  body = advance(body, "review_changes");
  assert.equal(body.state, "awaiting_correction");
  assert.equal(body.correctionsUsed, 1);
  body = advance(body, "correction_returned");
  body = advance(body, "review_changes");
  assert.equal(body.state, "split");
  assert.equal(body.correctionsUsed, 2);
});

test("approved sweep lands, and does not call a challenger", () => {
  let body = card();
  body = advance(body, "writer_returned");
  body = advance(body, "review_approved");
  assert.equal(body.state, "ready_to_land");
  assert.equal(JSON.parse(run(["next"], body).out).role, "land");
});

test("keystone challenge only with the owner's word, and it does not block the land", () => {
  let quiet = card({ tier: "keystone", keystone: "named" });
  quiet = advance(quiet, "writer_returned");
  quiet = advance(quiet, "review_approved");
  assert.equal(quiet.state, "ready_to_land");

  let asked = card({ tier: "keystone", keystone: "named", ownerChallenge: true });
  asked = advance(asked, "writer_returned");
  asked = advance(asked, "review_approved");
  assert.equal(asked.state, "awaiting_challenge");
  const decision = JSON.parse(run(["next"], asked).out);
  assert.equal(decision.role, "challenger");
  assert.equal(decision.prompt_file, "factory/roles/challenger.md");
  asked = advance(asked, "challenge_returned");
  assert.equal(asked.state, "ready_to_land");
  assert.equal(check(asked).length, 0);
  assert.equal(JSON.parse(run(["next"], asked).out).role, "land");
});

test("records: writer return lands, no review, no challenge", () => {
  let body = card({ tier: "records" });
  body = advance(body, "writer_returned");
  assert.equal(body.state, "ready_to_land");
  assert.equal(body.verdict, null);
  assert.equal(JSON.parse(run(["next"], body).out).role, "land");
  assert.throws(() => advance(body, "review_approved"));
});

test("check rejects a self-raised cap, a done lane with changes, and a challenge with no owner", () => {
  runFail(["check"], card({ correction_cap: 9 }));
  runFail(["check"], card({
    tier: "keystone",
    keystone: "named",
    state: "landed",
    verdict: "CHANGES REQUESTED",
  }));
  runFail(["check"], card({
    tier: "sweep",
    challengeDone: true,
    state: "ready_to_land",
    verdict: "APPROVED",
  }));
  runFail(["check"], card({ tier: "sweep", correctionsUsed: 2, state: "split", verdict: "CHANGES REQUESTED" }));
});

test("CLI advance matches lib and writes the card", () => {
  const body = card();
  const dir = mkdtempSync(join(tmpdir(), "round-"));
  const path = join(dir, "card.json");
  writeFileSync(path, JSON.stringify(body));
  const out = execFileSync(process.execPath, [orch, "advance", path, "writer_returned"], {
    encoding: "utf8",
    cwd: root,
  });
  const written = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(written.state, "awaiting_review");
  assert.equal(JSON.parse(out).next.role, "reviewer");
  assert.equal(execFileSync(process.execPath, [orch, "check", path], { encoding: "utf8", cwd: root }).trim(), "OK");
});

test("the orchestrator source does not call a model", () => {
  const src = readFileSync(orch, "utf8") + readFileSync(join(root, "factory/lib.mjs"), "utf8");
  assert.equal(src.includes("fetch("), false);
  assert.equal(src.includes("DEEPSEEK"), false);
  assert.equal(src.includes("callModel"), false);
  assert.equal(src.includes("reasoning_effort"), false);
  assert.equal(existsSync(join(root, "factory/run-role.mjs")), false);
  assert.equal(existsSync(join(root, "factory/adapters")), false);
});

test("prompts describe this loop", () => {
  const roles = join(root, "factory/roles");
  const files = ["README.md", "writer.md", "reviewer.md", "challenger.md", "corrector.md", "../HANDOFF_PROTOCOL.md"];
  for (const name of files) {
    const text = readFileSync(join(roles, name), "utf8");
    assert.equal(/<[A-Z][^>\n]{0,40}>/.test(text), false, name);
    assert.equal(/reasoning_effort\s*[:=]/.test(text), false, name);
    assert.equal(/use deepseek-reasoner/.test(text), false, name);
    assert.equal(text.includes("[CLEAN]"), false, name);
    assert.equal(text.includes("[BLOCKING]"), false, name);
  }
  const reviewer = readFileSync(join(roles, "reviewer.md"), "utf8");
  assert.match(reviewer, /VERDICT: APPROVED/);
  assert.match(reviewer, /factory\/templates\/REVIEW\.md/);
  const writer = readFileSync(join(roles, "writer.md"), "utf8");
  assert.match(writer, /contracts\/seat-return\.v1\.json/);
  assert.match(writer, /factory\/templates\/ENVELOPE\.md|envelope is the authorization/);
  const challenger = readFileSync(join(roles, "challenger.md"), "utf8");
  assert.match(challenger, /factory\/traps\.yaml/);
  assert.match(challenger, /Never Fable/);
  assert.match(challenger, /Do not suggest a fix/);
  const corrector = readFileSync(join(roles, "corrector.md"), "utf8");
  assert.match(corrector, /one correction/);
  assert.match(corrector, /keystone two/);
  const protocol = readFileSync(join(root, "factory/HANDOFF_PROTOCOL.md"), "utf8");
  assert.match(protocol, /Not a handoff/);
  assert.match(protocol, /no ordinary tier/);
  assert.match(protocol, /no reasoning_effort/);
  assert.match(protocol, /deepseek-reasoner` is not a catalog id/);
  const readme = readFileSync(join(roles, "README.md"), "utf8");
  assert.match(readme, /deepseek-flash/);
  assert.match(readme, /deepseek-v4-pro/);
});
