import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const connectorPath = fileURLToPath(new URL("../bin/viberacing.mjs", import.meta.url));
const sourceId = "11111111-1111-4111-8111-111111111111";
const clientSourceId = "33333333-3333-4333-8333-333333333333";
const providerIds = ["synthetic-claude-provider-message-a", "e9".repeat(32)];

// JSON.parse resolves ordinary JSON escapes. Object.entries visits own keys only.
function findId(value, id, path = "$", depth = 0) {
  assert.ok(depth < 100, "state.json nesting exceeds this small test's bound");
  if (typeof value === "string") return value.includes(id) ? path : null;
  if (value === null || typeof value !== "object") return null;
  for (const [index, [key, child]] of Object.entries(value).entries()) {
    const label = Array.isArray(value)
      ? `[${index}]`
      : /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key) && !key.includes(id)
        ? `.${key}`
        : `.{key#${index}}`;
    const childPath = `${path}${label}`;
    if (key.includes(id)) return `${childPath} (key)`;
    const found = findId(child, id, childPath, depth + 1);
    if (found) return found;
  }
  return null;
}

function assertPrivateDocument(serialized, ids, step) {
  assert.ok(typeof serialized === "string" && serialized.length > 0, `${step}: empty state.json`);
  let state;
  try {
    state = JSON.parse(serialized);
  } catch {
    throw new Error(`${step}: invalid state.json JSON`);
  }
  assert.ok(state !== null && typeof state === "object" && !Array.isArray(state),
    `${step}: state.json is not an object`);
  const leaks = [];
  for (const id of ids) {
    const path = findId(state, id);
    if (serialized.includes(id) || path !== null)
      leaks.push(`raw synthetic provider ID ${id} at ${path ?? "$ (serialized bytes)"}`);
  }
  assert.equal(leaks.length, 0, `${step}: ${leaks.join("; ")}`);
}

async function assertPrivateStateFile(file, ids, step) {
  const size = (await stat(file)).size;
  assert.ok(size > 0, `${step}: state.json is empty`);
  const bytes = await readFile(file);
  assert.equal(bytes.length, size, `${step}: incomplete state.json read`);
  assertPrivateDocument(bytes.toString("utf8"), ids, step);
  return bytes;
}

function usageResponse(body) {
  const snapshots = body.snapshots ?? [];
  const sourceErrors = body.sourceErrors ?? [];
  const sequenceById = new Map(snapshots.map((snapshot) => [snapshot.sourceId, snapshot.syncSequence]));
  return {
    acceptedEntries: snapshots.flatMap((snapshot) => snapshot.entries ?? []).length,
    acceptedSnapshots: snapshots.length,
    acceptedSourceErrors: sourceErrors.length,
    staleSourceErrors: 0,
    legacySourceErrorsIgnored: 0,
    staleSnapshots: 0,
    sourceSequences: [...snapshots, ...sourceErrors].map((item) => ({
      sourceId: item.sourceId,
      lastAcceptedSyncSequence: sequenceById.get(item.sourceId) ?? "0",
      accepted: sequenceById.has(item.sourceId),
    })),
  };
}

function environment(home) {
  return {
    HOME: home,
    USERPROFILE: home,
    TMPDIR: tmpdir(),
    PATH: process.env.PATH ?? "",
    VIBERACING_STATE_DIR: join(home, ".viberacing"),
    CODEX_HOME: join(home, ".codex"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    KIMI_CODE_HOME: join(home, ".kimi-code"),
    KIMI_SHARE_DIR: join(home, ".kimi"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    QWEN_HOME: join(home, ".qwen"),
    QWEN_RUNTIME_DIR: "",
    GEMINI_CLI_HOME: home,
    OPENCODE_DB: "",
    VIBERACING_TEST_COLLECTOR_TRACE: join(home, "collector.trace"),
    NODE_ENV: "test",
  };
}

async function writeInstallation(home, origin, dataPath) {
  const directory = join(home, ".viberacing");
  const localSource = {
    clientSourceId,
    agentId: "claude_code",
    collectionMethod: "claude_jsonl",
    dataPath,
    supportedSurface: "cli",
    suggestedLabel: "Synthetic Claude",
  };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".viberacing-state"), '{"format":1}\n');
  await writeFile(join(directory, "sources.json"), `${JSON.stringify({ version: 1, sources: [localSource] })}\n`);
  await writeFile(join(directory, "config.json"), `${JSON.stringify({
    version: 2,
    origin,
    deviceToken: "synthetic-device-token-that-is-long-enough",
    sources: [{
      clientSourceId,
      sourceId,
      agentId: "claude_code",
      accountLabel: "Synthetic Claude",
      collectionMethod: "claude_jsonl",
      lastAcceptedSyncSequence: "0",
    }],
  })}\n`);
  const stateFile = join(directory, "state.json");
  const initial = `${JSON.stringify({ version: 1, sequences: { [sourceId]: "0" } })}\n`;
  await writeFile(stateFile, initial);
  return { stateFile, initial };
}

function expectedRows(days) {
  return [[days[0], "15", "10", "5"], [days[1], "11", "7", "4"]];
}

function assertAcceptedSnapshot(snapshot, rows, step) {
  assert.ok(snapshot, `${step}: Claude source produced no snapshot`);
  assert.equal(snapshot.sourceId, sourceId, `${step}: wrong source`);
  assert.equal(snapshot.completeness, "complete", `${step}: incomplete Claude collection`);
  assert.deepEqual(
    snapshot.entries?.map((entry) => [entry.date, entry.totalTokens, entry.inputTokens, entry.outputTokens]),
    rows,
    `${step}: missing, zero, duplicated or changed Claude usage`,
  );
  assert.ok(rows.every(([, total]) => BigInt(total) > 0n), `${step}: zero expected usage`);
}

test("known-ID document check covers nested keys, values and JSON escapes", () => {
  const id = providerIds[0];
  assert.throws(() => assertPrivateDocument(JSON.stringify({ nested: { [id]: 1 } }), [id], "key"),
    /key: raw synthetic provider ID .* at \$\.nested\.\{key#0\} \(key\)/);
  assert.throws(() => assertPrivateDocument(JSON.stringify({ nested: { value: id } }), [id], "value"),
    /value: raw synthetic provider ID .* at \$\.nested\.value/);
  const escaped = JSON.stringify({ nested: { value: id } }).replace(id, `\\u0073${id.slice(1)}`);
  assert.ok(!escaped.includes(id));
  assert.throws(() => assertPrivateDocument(escaped, [id], "escaped"),
    /escaped: raw synthetic provider ID .* at \$\.nested\.value/);
  assert.throws(() => assertPrivateDocument(JSON.stringify({ nested: providerIds[1] }),
    [providerIds[1]], "hex ID"), /hex ID: raw synthetic provider ID .* at \$\.nested/);
  assert.doesNotThrow(() => assertPrivateDocument(JSON.stringify({ digest: "c3".repeat(32) }),
    [providerIds[1]], "other digest"));
  assert.throws(() => assertPrivateDocument("{", providerIds, "damaged"), /invalid state.json JSON/);
  assert.throws(() => assertPrivateDocument("", providerIds, "empty"), /empty state.json/);
});

test("missing state and missing or zero usage cannot pass", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claude-privacy-control-"));
  try {
    await assert.rejects(assertPrivateStateFile(join(directory, "absent.json"), providerIds, "absent"),
      { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const rows = expectedRows(["2026-01-01", "2026-01-02"]);
  assert.throws(() => assertAcceptedSnapshot(undefined, rows, "missing"), /no snapshot/);
  assert.throws(() => assertAcceptedSnapshot({ sourceId, completeness: "complete", entries: [] },
    rows, "empty"), /missing, zero, duplicated or changed/);
  assert.throws(() => assertAcceptedSnapshot({ sourceId, completeness: "complete", entries: [
    { date: rows[0][0], totalTokens: "0", inputTokens: "0", outputTokens: "0" },
    { date: rows[1][0], totalTokens: "0", inputTokens: "0", outputTokens: "0" },
  ] }, rows, "zero"), /missing, zero, duplicated or changed/);
});

test("CLI sync persists accepted Claude usage without raw provider IDs", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "claude-persisted-privacy-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const midnight = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const days = [2, 1].map((offset) => new Date(midnight - offset * 86_400_000).toISOString().slice(0, 10));
  const rows = expectedRows(days);
  const dataPath = join(home, "claude-events");
  const sessionFile = join(dataPath, "session.jsonl");
  await mkdir(dataPath, { recursive: true });
  const events = providerIds.map((id, index) => ({
    type: "assistant",
    timestamp: `${days[index]}T12:00:00Z`,
    message: { role: "assistant", id, usage: {
      input_tokens: index === 0 ? 10 : 7,
      output_tokens: index === 0 ? 5 : 4,
    } },
  }));
  await writeFile(sessionFile, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

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
        else if (request.url === "/api/usage") answer = usageResponse(body);
        else if (request.url === "/api/installations/current/diagnostics")
          answer = { acceptedEvents: body.events.length };
        else { response.writeHead(404).end(); return; }
        calls.push({ path: request.url, body, answer });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(answer));
      } catch {
        response.writeHead(400).end();
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const { stateFile, initial } = await writeInstallation(home,
    `http://127.0.0.1:${server.address().port}`, dataPath);

  async function runSync(step, ordinal) {
    const start = calls.length;
    const command = await execFileAsync(process.execPath, [connectorPath, "sync"], {
      env: environment(home), timeout: 20_000,
    });
    assert.match(command.stdout, /Synced 2 daily totals from 1 source\(s\)\./,
      `${step}: CLI did not report accepted usage`);
    const newCalls = calls.slice(start);
    const uploads = newCalls.filter((call) => call.path === "/api/usage");
    assert.equal(uploads.length, 1, `${step}: expected one usage request`);
    assert.equal(uploads[0].body.snapshots?.length, 1, `${step}: expected one Claude snapshot`);
    assertAcceptedSnapshot(uploads[0].body.snapshots[0], rows, step);
    assert.equal(uploads[0].answer.acceptedEntries, 2, `${step}: fixture did not accept both daily rows`);
    assert.equal(uploads[0].answer.acceptedSnapshots, 1, `${step}: fixture did not accept Claude snapshot`);
    assert.deepEqual(uploads[0].answer.sourceSequences, [{
      sourceId,
      lastAcceptedSyncSequence: uploads[0].body.snapshots[0].syncSequence,
      accepted: true,
    }], `${step}: fixture did not acknowledge the source sequence`);
    const trace = (await readFile(join(home, "collector.trace"), "utf8")).trim().split("\n");
    assert.deepEqual(trace, Array(ordinal).fill(clientSourceId), `${step}: Claude collector not run`);
    const bytes = await readFile(stateFile);
    assert.ok(bytes.length > 0, `${step}: state.json was not written`);
    if (ordinal === 1) assert.notEqual(bytes.toString("utf8"), initial,
      `${step}: only precreated installation state exists`);
    t.diagnostic(`${step}: CLI exit 0; loopback accepted 2 entries and source sequence; ` +
      `Claude collector call ${ordinal}; accepted ${rows.map(([day, total]) => `${day}=${total}`).join(", ")}; ` +
      `state.json ${bytes.length} bytes${ordinal === 1 ? " (changed from installation state)" : ""}`);
    await assertPrivateStateFile(stateFile, providerIds, step);
  }

  await runSync("first sync", 1);
  await runSync("new-process reload", 2);
  await unlink(sessionFile);
  await runSync("new-process retention after source deletion", 3);
});
