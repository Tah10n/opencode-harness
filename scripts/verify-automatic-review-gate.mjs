import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  automaticReviewObservation,
  buildAutomaticReviewDiff,
  renderAutomaticReviewPrompt,
} from "../lib/quality/automatic-review-gate.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "automatic-review-gate-"));
try {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/task.mjs"), "export const value = 2;\n", "utf8");
  const diff = buildAutomaticReviewDiff({
    workspace_root: root,
    public_files: [{ path: "src/task.mjs", content: "export const value = 1;\n" }],
    changed_paths: ["src/task.mjs"],
  });
  assert.deepEqual(diff.files[0], {
    path: "src/task.mjs",
    before: "export const value = 1;\n",
    after: "export const value = 2;\n",
  });
  const prompt = renderAutomaticReviewPrompt({ visible_requirements: "Change value to 2", final_diff: diff });
  assert.match(prompt, /VISIBLE_REQUIREMENTS=Change value to 2/u);
  assert.match(prompt, /FINAL_DIFF_V1=/u);
  assert.doesNotMatch(prompt, /reference patch/iu);
  const complete = automaticReviewObservation({ eligible: true, started: true, completed: true, workspace_unchanged: true });
  assert.equal(complete.terminal_allowed, true);
  const finding = automaticReviewObservation({
    eligible: true,
    started: true,
    completed: true,
    workspace_unchanged: true,
    findings: [{ severity: "HIGH", path: "src/task.mjs", line: 1, contract: "must return 2", evidence: "returns 3", body: "return 2" }],
  });
  assert.equal(finding.terminal_allowed, false);
  assert.equal(finding.review_finding_count, 1);
  fs.unlinkSync(path.join(root, "src/task.mjs"));
  const deletion = buildAutomaticReviewDiff({
    workspace_root: root,
    public_files: [{ path: "src/task.mjs", content: "export const value = 1;\n" }],
    changed_paths: ["src/task.mjs"],
  });
  assert.equal(deletion.files[0].after, null);
  const remediated = automaticReviewObservation({
    eligible: true,
    started: true,
    completed: true,
    workspace_unchanged: true,
    reviewer_caused_fix_count: 1,
    findings: finding.findings,
  });
  assert.equal(remediated.terminal_allowed, true);
  assert.throws(() => automaticReviewObservation({
    eligible: true,
    started: true,
    completed: true,
    workspace_unchanged: true,
    findings: [{ severity: "LOW", path: "src/task.mjs", line: 1, contract: "x", evidence: "y", body: "z" }],
  }), /AUTOMATIC_REVIEW_SCHEMA/u);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

process.stdout.write("automatic review gate passed\n");
