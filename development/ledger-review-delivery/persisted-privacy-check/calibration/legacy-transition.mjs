import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// Run inside the pinned Node container with both copies under /calibration.
// All installation data is synthetic.
const runFile = promisify(execFile);
const sourceId = "11111111-1111-4111-8111-111111111111";
const clientSourceId = "33333333-3333-4333-8333-333333333333";
const ids = ["calibration-legacy-alpha", "b7".repeat(32), "calibration-new-gamma"];
const midnight = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
const days = [3, 2, 1].map((offset) =>
  new Date(midnight - offset * 86_400_000).toISOString().slice(0, 10));
const tuples = [[10, 5], [7, 4], [3, 2]];
const expected = (count) => days.slice(0, count).map((day, index) => [
  day, String(tuples[index][0] + tuples[index][1]),
  String(tuples[index][0]), String(tuples[index][1]), "0", "0", "0",
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const home = await mkdtemp(join(tmpdir(), "claude-legacy-transition-"));
const stateDirectory = join(home, ".viberacing");
const stateFile = join(stateDirectory, "state.json");
const dataPath = join(home, "claude-events");
const sessionFile = join(dataPath, "session.jsonl");
const calls = [];
const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    try {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      let answer;
      if (request.url === "/api/installations/current") answer = {
        sources: [{ sourceId, status: "active", lastAcceptedSyncSequence: "0" }],
      };
      else if (request.url === "/api/usage") {
        const snapshots = body.snapshots ?? [];
        answer = {
          acceptedEntries: snapshots.flatMap((snapshot) => snapshot.entries ?? []).length,
          acceptedSnapshots: snapshots.length,
          acceptedSourceErrors: 0,
          staleSourceErrors: 0,
          legacySourceErrorsIgnored: 0,
          staleSnapshots: 0,
          sourceSequences: snapshots.map((snapshot) => ({
            sourceId: snapshot.sourceId,
            lastAcceptedSyncSequence: snapshot.syncSequence,
            accepted: true,
          })),
        };
      } else if (request.url === "/api/installations/current/diagnostics")
        answer = { acceptedEvents: body.events.length };
      else { response.writeHead(404).end(); return; }
      calls.push({ path: request.url, body, answer });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(answer));
    } catch { response.writeHead(400).end(); }
  });
});

function environment() {
  return {
    HOME: home, USERPROFILE: home, TMPDIR: tmpdir(), PATH: process.env.PATH ?? "",
    VIBERACING_STATE_DIR: stateDirectory,
    CODEX_HOME: join(home, ".codex"), CLAUDE_CONFIG_DIR: join(home, ".claude"),
    KIMI_CODE_HOME: join(home, ".kimi-code"), KIMI_SHARE_DIR: join(home, ".kimi"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    QWEN_HOME: join(home, ".qwen"), QWEN_RUNTIME_DIR: "",
    GEMINI_CLI_HOME: home, OPENCODE_DB: "",
    VIBERACING_TEST_COLLECTOR_TRACE: join(home, "collector.trace"), NODE_ENV: "test",
  };
}

function records(count) {
  return `${ids.slice(0, count).map((id, index) => JSON.stringify({
    type: "assistant", timestamp: `${days[index]}T12:00:00Z`,
    message: { role: "assistant", id, usage: {
      input_tokens: tuples[index][0], output_tokens: tuples[index][1],
    } },
  })).join("\n")}\n`;
}

async function sync(label, root, count, requirePrivate) {
  const start = calls.length;
  const { stdout } = await runFile(process.execPath,
    [join(root, "packages/connector/bin/viberacing.mjs"), "sync"],
    { env: environment(), timeout: 20_000 });
  assert.match(stdout, new RegExp(`Synced ${count} daily totals from 1 source\\(s\\)\\.`));
  const uploads = calls.slice(start).filter((call) => call.path === "/api/usage");
  assert.equal(uploads.length, 1, `${label}: usage request count`);
  assert.equal(uploads[0].body.snapshots?.length, 1, `${label}: source snapshot count`);
  const snapshot = uploads[0].body.snapshots[0];
  assert.equal(snapshot.sourceId, sourceId);
  assert.equal(snapshot.completeness, "complete");
  const rows = snapshot.entries?.map((entry) => [
    entry.date, entry.totalTokens, entry.inputTokens, entry.outputTokens,
    entry.cacheReadTokens, entry.cacheWriteTokens, entry.reasoningTokens,
  ]);
  assert.deepEqual(rows, expected(count), `${label}: exact accepted components`);
  assert.equal(uploads[0].answer.acceptedEntries, count, `${label}: acknowledgement`);
  assert.deepEqual(uploads[0].answer.sourceSequences, [{
    sourceId, lastAcceptedSyncSequence: snapshot.syncSequence, accepted: true,
  }], `${label}: source sequence acknowledgement`);
  const serialized = await readFile(stateFile, "utf8");
  const state = JSON.parse(serialized);
  assert.equal(typeof state, "object");
  if (requirePrivate) {
    for (const id of ids) assert.ok(!serialized.includes(id), `${label}: leaked ${id}`);
    for (const adapter of [state.adapters?.[sourceId],
      state.adaptersByClientSourceId?.[clientSourceId]])
      assert.equal(adapter?.identityVersion, 1, `${label}: Claude identity marker`);
  }
  return {
    label, requestPath: uploads[0].path,
    acceptedEntries: uploads[0].answer.acceptedEntries,
    acceptedSequence: snapshot.syncSequence, rows,
    stateBytes: Buffer.byteLength(serialized), stateSha256: sha256(serialized),
    rawIdsAbsent: requirePrivate ? ids.every((id) => !serialized.includes(id)) : false,
    stateJsonValid: true,
  };
}

try {
  await mkdir(stateDirectory, { recursive: true });
  await mkdir(dataPath, { recursive: true });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  await writeFile(join(stateDirectory, ".viberacing-state"), '{"format":1}\n');
  await writeFile(join(stateDirectory, "sources.json"), `${JSON.stringify({
    version: 1, sources: [{ clientSourceId, agentId: "claude_code",
      collectionMethod: "claude_jsonl", dataPath, supportedSurface: "cli",
      suggestedLabel: "Synthetic Claude" }],
  })}\n`);
  await writeFile(join(stateDirectory, "config.json"), `${JSON.stringify({
    version: 2, origin, deviceToken: "synthetic-device-token-that-is-long-enough",
    sources: [{ clientSourceId, sourceId, agentId: "claude_code",
      accountLabel: "Synthetic Claude", collectionMethod: "claude_jsonl",
      lastAcceptedSyncSequence: "0" }],
  })}\n`);
  await writeFile(stateFile, `${JSON.stringify({ version: 1, sequences: { [sourceId]: "0" } })}\n`);
  await writeFile(sessionFile, records(2));
  const old = await sync("unchanged final", "/calibration/legacy", 2, false);
  const oldState = await readFile(stateFile);
  for (const id of ids.slice(0, 2))
    assert.ok(oldState.includes(id), `unchanged final did not persist ${id}`);
  await unlink(sessionFile);
  const afterDeletion = await sync("fixed after source deletion", "/calibration/final", 2, true);
  await writeFile(sessionFile, records(3));
  const afterNewEvent = await sync("fixed old plus new", "/calibration/final", 3, true);
  const afterReload = await sync("fixed reload", "/calibration/final", 3, true);
  console.log(JSON.stringify({ oldStateBase64: oldState.toString("base64"),
    receipts: [old, afterDeletion, afterNewEvent, afterReload],
    oldStateSha256: sha256(oldState), oldRawIdsPresent: true,
    syntheticProviderIds: ids }));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(home, { recursive: true, force: true });
}
