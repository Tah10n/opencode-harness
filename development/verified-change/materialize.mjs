import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as queue from "./queue-cancellation.mjs";
import * as config from "./config-propagation.mjs";

const cases = { "queue-cancellation": queue, "config-propagation": config };
const selected = process.argv[2] ?? "queue-cancellation";
if (!Object.hasOwn(cases, selected)) throw new Error("Unknown development case");
const { task, files } = cases[selected];

// Materialization only: this script never makes a provider request or retries a run.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "verified-change-development-"));
const repository = path.join(root, "repository"); fs.mkdirSync(repository);
for (const [relative, content] of Object.entries(files)) {
  const target = path.join(repository, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content);
}
fs.writeFileSync(path.join(repository, ".opencode-harness.json"), JSON.stringify({
  version: 1, image: "node:24.19.0-bookworm-slim", sourcePaths: ["src"],
  protectedPaths: ["test", "README.md", ".opencode-harness.json"],
  checks: [{ id: "public", kind: "node-test", files: ["test/public.test.mjs"] }],
  sessionTimeoutMs: 240_000,
}, null, 2));
for (const args of [["init"], ["add", "."], ["-c", "user.name=Development Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "public baseline"]]) {
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repository, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}
fs.writeFileSync(path.join(root, "task.txt"), task);
console.log(JSON.stringify({ root, repository, taskFile: path.join(root, "task.txt"), purpose: "development-only", case: selected }));
