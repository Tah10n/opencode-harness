import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  access,
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { connectorVersion } from "../lib/version.mjs";

const execFileAsync = promisify(execFile);
const connectorPath = fileURLToPath(new URL("../bin/viberacing.mjs", import.meta.url));
const connectionStateChildPath = fileURLToPath(
  new URL("../test-support/connection-state-child.mjs", import.meta.url),
);

const sourceIds = new Map();
function source(agentId) {
  if (!sourceIds.has(agentId)) {
    const suffix = (sourceIds.size + 1).toString().padStart(12, "0");
    sourceIds.set(agentId, `00000000-0000-4000-8000-${suffix}`);
  }
  return { agentId, clientSourceId: sourceIds.get(agentId) };
}

function swapUtf16TestBytes(value) {
  const swapped = Buffer.alloc(value.length);
  for (let index = 0; index < value.length; index += 2) {
    swapped[index] = value[index + 1];
    swapped[index + 1] = value[index];
  }
  return swapped;
}

function encodedTestJson(value, encoding) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (encoding === "utf16le")
    return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(json, "utf16le")]);
  if (encoding === "utf16be")
    return Buffer.concat([
      Buffer.from([0xfe, 0xff]),
      swapUtf16TestBytes(Buffer.from(json, "utf16le")),
    ]);
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json, "utf8")]);
}

function decodedTestJson(value, encoding) {
  if (encoding === "utf16le") return JSON.parse(value.subarray(2).toString("utf16le"));
  if (encoding === "utf16be")
    return JSON.parse(swapUtf16TestBytes(value.subarray(2)).toString("utf16le"));
  return JSON.parse(value.subarray(3).toString("utf8"));
}

function usageResponse(body, overrides = {}) {
  const snapshots = body.snapshots ?? [];
  const sourceErrors = body.sourceErrors ?? [];
  const sequenceById = new Map(
    snapshots.map((snapshot) => [snapshot.sourceId, snapshot.syncSequence]),
  );
  return {
    acceptedEntries: snapshots.flatMap((snapshot) => snapshot.entries ?? []).length,
    acceptedSnapshots: snapshots.length,
    acceptedSourceErrors: sourceErrors.length,
    staleSnapshots: 0,
    sourceSequences: [...snapshots, ...sourceErrors].map((item) => ({
      sourceId: item.sourceId,
      lastAcceptedSyncSequence: sequenceById.get(item.sourceId) ?? "0",
      accepted: sequenceById.has(item.sourceId),
    })),
    ...overrides,
  };
}

function reconciliationResponse(sources) {
  return {
    sources: sources.map((source) => ({
      sourceId: source.sourceId,
      status: source.status ?? "active",
      lastAcceptedSyncSequence: source.lastAcceptedSyncSequence ?? "0",
    })),
  };
}

function connectorEnvironment(home, extra = {}) {
  return {
    ...process.env,
    VIBERACING_STATE_DIR: join(home, ".viberacing"),
    CODEX_HOME: join(home, ".codex"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    KIMI_CODE_HOME: join(home, ".kimi-code"),
    KIMI_SHARE_DIR: join(home, ".kimi"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    OPENCODE_DB: "",
    QWEN_HOME: join(home, ".qwen"),
    QWEN_RUNTIME_DIR: "",
    GEMINI_CLI_HOME: home,
    ...extra,
  };
}

function useModuleEnvironment(home) {
  const environment = connectorEnvironment(home);
  const names = [
    "VIBERACING_STATE_DIR",
    "CODEX_HOME",
    "CLAUDE_CONFIG_DIR",
    "KIMI_CODE_HOME",
    "KIMI_SHARE_DIR",
    "QWEN_HOME",
    "GEMINI_CLI_HOME",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = environment[name];
  return () => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  };
}

async function writeLocalSources(directory, sources) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".viberacing-state"), '{"format":1}\n');
  await writeFile(join(directory, "sources.json"), `${JSON.stringify({ version: 1, sources })}\n`);
}

async function readLocalSources(directory) {
  return JSON.parse(await readFile(join(directory, "sources.json"), "utf8")).sources;
}

async function writeCaptureInstallation(home, origin, options = {}) {
  const directory = join(home, ".viberacing");
  const clientSourceId = options.clientSourceId ?? "abababab-abab-4bab-8bab-abababababab";
  const capture = join(directory, "captures", `${clientSourceId}.jsonl`);
  const sourceId = options.sourceId ?? "89898989-8989-4989-8989-898989898989";
  const date = new Date().toISOString().slice(0, 10);
  await mkdir(join(directory, "captures"), { recursive: true });
  await writeFile(join(directory, ".viberacing-state"), '{"format":1}\n');
  await writeFile(
    capture,
    `${JSON.stringify({
      id: options.eventId ?? "synthetic-network-event",
      date,
      usage: { date, totalTokens: "3", inputTokens: "1", outputTokens: "2" },
    })}\n`,
  );
  await writeLocalSources(directory, [
    {
      clientSourceId,
      agentId: "antigravity",
      dataPath: capture,
      collectionMethod: "antigravity_cli_capture",
      supportedSurface: "cli",
      suggestedLabel: "Antigravity",
    },
  ]);
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin,
      ...(options.installationId === undefined ? {} : { installationId: options.installationId }),
      deviceToken: "synthetic-device-token-that-is-long-enough",
      sources: [
        {
          clientSourceId,
          sourceId,
          agentId: "antigravity",
          accountLabel: "Antigravity",
          collectionMethod: "antigravity_cli_capture",
          lastAcceptedSyncSequence: "0",
        },
      ],
    })}\n`,
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({ version: 1, sequences: { [sourceId]: "0" } })}\n`,
  );
  return { directory, capture, clientSourceId, sourceId };
}

async function writeMappedInstallation(home, origin, sources) {
  const directory = join(home, ".viberacing");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".viberacing-state"), '{"format":1}\n');
  await writeLocalSources(
    directory,
    sources.map(({ sourceId: _sourceId, accountLabel: _accountLabel, ...source }) => source),
  );
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin,
      deviceToken: "synthetic-device-token-that-is-long-enough",
      sources: sources.map((source) => ({
        clientSourceId: source.clientSourceId,
        sourceId: source.sourceId,
        agentId: source.agentId,
        accountLabel: source.accountLabel ?? source.suggestedLabel,
        collectionMethod: source.collectionMethod,
        lastAcceptedSyncSequence: "0",
      })),
    })}\n`,
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: Object.fromEntries(sources.map((source) => [source.sourceId, "0"])),
    })}\n`,
  );
  return directory;
}

async function runWithInput(arguments_, environment, input) {
  const child = spawn(process.execPath, [connectorPath, ...arguments_], {
    env: environment,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  child.stdin.end(input);
  const [code] = await once(child, "close");
  return { code, stdout, stderr, pid: child.pid };
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for test condition");
    await delay(20);
  }
}

test("installs a runnable connector copy and additive, owned hooks", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-connector-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    await mkdir(join(home, ".codex"));
    await writeFile(
      join(home, ".codex", "hooks.json"),
      JSON.stringify({
        hooks: {
          SessionEnd: [
            { hooks: [{ type: "command", command: "keep-me" }] },
            {
              hooks: [
                { type: "command", command: "node old --viberacing-hook-id=viberacing-hook-v2" },
              ],
            },
          ],
        },
      }),
    );
    const module = await import(`../lib/config.mjs?home=${encodeURIComponent(home)}`);
    await module.installHooks(new URL("../bin/viberacing.mjs", import.meta.url), [
      source("codex"),
      source("claude_code"),
      source("gemini_cli"),
      source("qwen_code"),
      source("kimi_code"),
    ]);
    const installedRuntime = join(home, ".viberacing", "runtime", connectorVersion);
    const installedLibrary = join(installedRuntime, "lib");
    for (const name of [
      "browser.mjs",
      "connection-lifecycle.mjs",
      "config.mjs",
      "executables.mjs",
      "owned-lock.mjs",
      "readers.mjs",
      "registry.mjs",
      "runtime.mjs",
    ])
      await access(join(installedLibrary, name));
    await access(join(installedLibrary, "adapters", "codex.mjs"));
    const stagedVersion = await execFileAsync(
      process.execPath,
      [join(installedRuntime, "bin", "viberacing.mjs"), "--version"],
      { env: connectorEnvironment(home) },
    );
    assert.equal(stagedVersion.stdout, `${connectorVersion}\n`);
    assert.equal(stagedVersion.stderr, "");
    const codex = JSON.parse(await readFile(join(home, ".codex", "hooks.json"), "utf8"));
    const claude = JSON.parse(await readFile(join(home, ".claude", "settings.json"), "utf8"));
    const gemini = JSON.parse(await readFile(join(home, ".gemini", "settings.json"), "utf8"));
    const qwen = JSON.parse(await readFile(join(home, ".qwen", "settings.json"), "utf8"));
    const kimi = await readFile(join(home, ".kimi-code", "config.toml"), "utf8");
    assert.equal(codex.hooks.SessionEnd[0].hooks[0].command, "keep-me");
    const codexMarker = module.hookMarkerForSource(source("codex").clientSourceId);
    assert.equal(
      codex.hooks.SessionEnd.filter((group) => JSON.stringify(group).includes(codexMarker)).length,
      1,
    );
    assert.doesNotMatch(JSON.stringify(codex), /viberacing-hook-v2/);
    assert.match(JSON.stringify(claude), /viberacing-hook-v3:/);
    assert.match(JSON.stringify(gemini), /viberacing-hook-v3:/);
    assert.match(JSON.stringify(qwen), /viberacing-hook-v3:/);
    assert.equal(gemini.hooks.SessionEnd.at(-1).hooks[0].timeout, 10_000);
    assert.equal(qwen.hooks.SessionEnd.at(-1).hooks[0].timeout, 10_000);
    assert.match(kimi, /\[\[hooks\]\][\s\S]*Stop[\s\S]*viberacing-hook-v3:/);
    const hooks = await module.diagnoseHooks([
      source("codex"),
      source("claude_code"),
      source("gemini_cli"),
      source("qwen_code"),
      source("kimi_code"),
      source("opencode"),
    ]);
    assert.deepEqual(hooks, {
      codex: "current",
      claude_code: "current",
      gemini_cli: "current",
      qwen_code: "current",
      kimi_code: "current",
      opencode: "manual-sync",
    });
    await writeFile(
      join(home, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: `node obsolete.mjs hook ${module.hookMarkerForSource(source("claude_code").clientSourceId)}`,
                },
              ],
            },
          ],
        },
      }),
    );
    assert.equal((await module.diagnoseHooks([source("claude_code")])).claude_code, "outdated");
    await module.installHooks(
      pathToFileURL(
        join(home, ".viberacing", "runtime", connectorVersion, "bin", "viberacing.mjs"),
      ),
      [source("codex")],
    );
    await module.removeHooks();
    assert.doesNotMatch(
      await readFile(join(home, ".codex", "hooks.json"), "utf8"),
      /viberacing-hook-v[23]/,
    );
    assert.match(await readFile(join(home, ".codex", "hooks.json"), "utf8"), /keep-me/);
    assert.doesNotMatch(
      await readFile(join(home, ".kimi-code", "config.toml"), "utf8"),
      /viberacing-hook-v[23]/,
    );
  } finally {
    restoreEnvironment();
  }
});

test("preserves BOM-encoded JSON hook settings while installing owned hooks", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-hook-encoding-"));
  const restoreEnvironment = useModuleEnvironment(home);
  const fixtures = [
    { agentId: "codex", directory: ".codex", file: "hooks.json", encoding: "utf8-bom" },
    {
      agentId: "claude_code",
      directory: ".claude",
      file: "settings.json",
      encoding: "utf16le",
    },
    {
      agentId: "gemini_cli",
      directory: ".gemini",
      file: "settings.json",
      encoding: "utf16be",
    },
  ];
  try {
    for (const fixture of fixtures) {
      await mkdir(join(home, fixture.directory), { recursive: true });
      await writeFile(
        join(home, fixture.directory, fixture.file),
        encodedTestJson({ retained: fixture.agentId }, fixture.encoding),
      );
    }
    const module = await import(`../lib/config.mjs?hook-encoding=${encodeURIComponent(home)}`);
    await module.installHooks(
      new URL("../bin/viberacing.mjs", import.meta.url),
      fixtures.map((fixture) => source(fixture.agentId)),
    );
    for (const fixture of fixtures) {
      const raw = await readFile(join(home, fixture.directory, fixture.file));
      const settings = decodedTestJson(raw, fixture.encoding);
      assert.equal(settings.retained, fixture.agentId);
      assert.match(JSON.stringify(settings.hooks), /viberacing-hook-v3:/);
      if (fixture.encoding === "utf8-bom")
        assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      else if (fixture.encoding === "utf16le")
        assert.deepEqual([...raw.subarray(0, 2)], [0xff, 0xfe]);
      else assert.deepEqual([...raw.subarray(0, 2)], [0xfe, 0xff]);
    }
    assert.deepEqual(
      await module.diagnoseHooks(fixtures.map((fixture) => source(fixture.agentId))),
      {
        codex: "current",
        claude_code: "current",
        gemini_cli: "current",
      },
    );
  } finally {
    restoreEnvironment();
    await rm(home, { recursive: true, force: true });
  }
});

test("rejects truncated UTF-16 hook settings without changing them", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-hook-truncated-"));
  const restoreEnvironment = useModuleEnvironment(home);
  const path = join(home, ".claude", "settings.json");
  const original = Buffer.from([0xff, 0xfe, 0x7b]);
  try {
    await mkdir(join(home, ".claude"), { recursive: true });
    await writeFile(path, original);
    const module = await import(`../lib/config.mjs?hook-truncated=${encodeURIComponent(home)}`);
    await assert.rejects(
      module.installHooks(new URL("../bin/viberacing.mjs", import.meta.url), [
        source("claude_code"),
      ]),
      /truncated UTF-16/,
    );
    assert.deepEqual(await readFile(path), original);
  } finally {
    restoreEnvironment();
    await rm(home, { recursive: true, force: true });
  }
});

test("rejects an incomplete runtime before pairing-compatible staging completes", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-runtime-staging-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const brokenRoot = join(home, "broken-package");
    const brokenScript = join(brokenRoot, "bin", "viberacing.mjs");
    await mkdir(join(brokenRoot, "bin"), { recursive: true });
    await writeFile(brokenScript, "import '../lib/protocol.mjs';\n");
    const module = await import(`../lib/config.mjs?staging=${encodeURIComponent(home)}`);
    await assert.rejects(module.prepareRuntime(pathToFileURL(brokenScript)));
    await assert.rejects(
      access(join(home, ".viberacing", "runtime", connectorVersion, "bin", "viberacing.mjs")),
    );
    assert.deepEqual(await readdir(join(home, ".viberacing", "runtime")), []);
  } finally {
    restoreEnvironment();
    await rm(home, { recursive: true, force: true });
  }
});

test("recovers a connection commit interrupted before the source registry is published", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-connection-commit-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?connection-commit=${encodeURIComponent(home)}`);
    const directory = join(home, ".viberacing");
    const localSource = {
      clientSourceId: "84848484-8484-4484-8484-848484848484",
      agentId: "codex",
      collectionMethod: "codex_app_server",
      dataPath: join(home, ".codex"),
      suggestedLabel: "Codex",
      supportedSurface: "desktop",
    };
    const mappedSource = {
      ...localSource,
      sourceId: "85858585-8585-4585-8585-858585858585",
      agentAccountId: "86868686-8686-4686-8686-868686868686",
      accountLabel: "Personal",
      lastAcceptedSyncSequence: "7",
    };
    await assert.rejects(
      module.commitConnectionState(
        {
          version: 2,
          origin: "https://viberacing.example",
          installationId: "87878787-8787-4787-8787-878787878787",
          deviceToken: "recoverable_device_token_that_is_long_enough",
          sources: [mappedSource],
          protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
        },
        [localSource],
        {
          afterConfigCommit() {
            throw new Error("Synthetic interruption between connection files");
          },
        },
      ),
      /Synthetic interruption between connection files/,
    );
    await access(join(directory, "config.json"));
    await access(join(directory, "connection-commit.json"));
    await assert.rejects(access(join(directory, "sources.json")));

    const recovered = await module.readConfig();
    assert.equal(recovered.deviceToken, "recoverable_device_token_that_is_long_enough");
    assert.deepEqual(
      recovered.sources.map((source) => ({
        clientSourceId: source.clientSourceId,
        sourceId: source.sourceId,
        dataPath: source.dataPath,
      })),
      [
        {
          clientSourceId: localSource.clientSourceId,
          sourceId: mappedSource.sourceId,
          dataPath: localSource.dataPath,
        },
      ],
    );
    assert.deepEqual(await module.readSources(), [localSource]);
    await assert.rejects(access(join(directory, "connection-commit.json")));

    await assert.rejects(
      module.commitConnectionState(
        {
          ...recovered,
          deviceToken: "token_that_must_not_be_restored_after_disconnect",
        },
        [localSource],
        {
          afterConfigCommit() {
            throw new Error("Synthetic interruption before explicit disconnect");
          },
        },
      ),
      /Synthetic interruption before explicit disconnect/,
    );
    await access(join(directory, "connection-commit.json"));
    await module.removeConfig();
    await assert.rejects(access(join(directory, "config.json")));
    await assert.rejects(access(join(directory, "connection-commit.json")));
    await assert.rejects(module.readConfig(), { code: "ENOENT" });
    assert.deepEqual(await module.readSources(), [localSource]);
  } finally {
    restoreEnvironment();
    await rm(home, { recursive: true, force: true });
  }
});

test("source and installation mutations invalidate a pending connect generation", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-connect-generation-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?connect-generation=${encodeURIComponent(home)}`);
    const directory = join(home, ".viberacing");
    const installationId = "81818181-8181-4181-8181-818181818181";
    const localSource = {
      clientSourceId: "82828282-8282-4282-8282-828282828282",
      agentId: "claude_code",
      collectionMethod: "claude_jsonl",
      dataPath: join(home, ".claude"),
      suggestedLabel: "Claude",
      supportedSurface: "cli",
    };
    const mappedSource = {
      ...localSource,
      sourceId: "83838383-8383-4383-8383-838383838383",
      agentAccountId: "84848484-8484-4484-8484-848484848484",
      accountLabel: "Claude",
      lastAcceptedSyncSequence: "0",
    };
    const nextConfig = {
      version: 2,
      origin: "https://viberacing.example",
      installationId,
      deviceToken: "generation_device_token_that_is_long_enough",
      sources: [mappedSource],
      protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
    };
    await module.writeSources([localSource]);
    await writeFile(
      join(directory, "installation.json"),
      `${JSON.stringify({
        version: 1,
        id: installationId,
        secret: "generation_installation_secret_that_is_long_enough",
      })}\n`,
    );

    const addedAttempt = await module.beginConnectAttempt({
      installationId,
      origin: nextConfig.origin,
      expectedSources: [localSource],
    });
    const addedSource = {
      clientSourceId: "85858585-8585-4585-8585-858585858585",
      agentId: "kimi_code",
      collectionMethod: "kimi_wire_jsonl",
      dataPath: join(home, ".kimi-code"),
      suggestedLabel: "Kimi",
      supportedSurface: "cli",
    };
    await module.addSource(addedSource);
    await assert.rejects(
      module.commitConnectionState(nextConfig, [localSource], { connectAttempt: addedAttempt }),
      { code: "connect_attempt_stale" },
    );

    const sourcesWithAddition = await module.readSources();
    const removedAttempt = await module.beginConnectAttempt({
      installationId,
      origin: nextConfig.origin,
      expectedSources: sourcesWithAddition,
    });
    await module.removeSource(addedSource.clientSourceId);
    await assert.rejects(
      module.commitConnectionState(nextConfig, [localSource], { connectAttempt: removedAttempt }),
      { code: "connect_attempt_stale" },
    );

    const resetAttempt = await module.beginConnectAttempt({
      installationId,
      origin: nextConfig.origin,
      expectedSources: [localSource],
    });
    await module.resetInstallation();
    await assert.rejects(
      module.commitConnectionState(nextConfig, [localSource], { connectAttempt: resetAttempt }),
      { code: "connect_attempt_stale" },
    );
    await assert.rejects(access(join(directory, "connect-attempt.json")));
    await assert.rejects(access(join(directory, "config.json")));
  } finally {
    restoreEnvironment();
    await rm(home, { recursive: true, force: true });
  }
});

test("disconnect wins both connection-state lock orders and provider hooks cannot resurrect state", async () => {
  for (const order of ["recovery-first", "disconnect-first"]) {
    const home = await mkdtemp(join(tmpdir(), `viberacing-connection-race-${order}-`));
    const restoreEnvironment = useModuleEnvironment(home);
    const environment = connectorEnvironment(home, { NODE_ENV: "test" });
    const directory = join(home, ".viberacing");
    const barrier = join(home, `connection-${order}`);
    const disconnectBarrier = `${barrier}-disconnect`;
    const clientSourceId = "88888888-8888-4888-8888-888888888888";
    const sourceId = "89898989-8989-4989-8989-898989898989";
    const deviceToken = `device_token_that_must_not_survive_${order}_race`;
    const hookRoot = join(home, ".claude");
    const localSource = {
      clientSourceId,
      agentId: "claude_code",
      collectionMethod: "claude_jsonl",
      dataPath: hookRoot,
      suggestedLabel: "Claude",
      supportedSurface: "cli",
      hookConfigRoot: hookRoot,
    };
    let recovery;
    let disconnect;
    try {
      const module = await import(
        `../lib/config.mjs?connection-race=${order}-${encodeURIComponent(home)}`
      );
      await mkdir(hookRoot, { recursive: true });
      await module.writeSources([localSource]);
      await writeFile(
        join(hookRoot, "settings.json"),
        `${JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `node hook ${module.hookMarkerForSource(clientSourceId)}`,
                  },
                ],
              },
            ],
          },
        })}\n`,
      );
      await assert.rejects(
        module.commitConnectionState(
          {
            version: 2,
            origin: "https://viberacing.example",
            installationId: "87878787-8787-4787-8787-878787878787",
            deviceToken,
            sources: [
              {
                ...localSource,
                sourceId,
                agentAccountId: "86868686-8686-4686-8686-868686868686",
                accountLabel: "Personal",
                lastAcceptedSyncSequence: "7",
              },
            ],
            protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
          },
          [localSource],
          {
            afterConfigCommit() {
              throw new Error("Synthetic interrupted connection commit");
            },
          },
        ),
        /Synthetic interrupted connection commit/,
      );
      await mkdir(join(directory, "pending"), { recursive: true });
      await writeFile(join(directory, "pending", `${sourceId}.json`), '{"pending":true}\n');
      await writeFile(join(directory, "dirty.json"), '{"version":2,"sources":{}}\n');
      restoreEnvironment();

      const spawnStateChild = (action, pause, barrierPath = barrier) => {
        const child = spawn(process.execPath, [connectionStateChildPath, action], {
          env: {
            ...environment,
            ...(pause
              ? {
                  VIBERACING_TEST_CONNECTION_STATE_PAUSE: pause,
                  VIBERACING_TEST_CONNECTION_STATE_BARRIER: barrierPath,
                }
              : {}),
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
        return {
          child,
          result: once(child, "close").then(([code]) => ({ code, stderr })),
        };
      };

      if (order === "recovery-first") {
        recovery = spawnStateChild("recover", "recovery_after_read");
        await waitFor(() =>
          access(`${barrier}.ready`)
            .then(() => true)
            .catch(() => false),
        );
        disconnect = spawnStateChild("disconnect-local", "remove_after_lock", disconnectBarrier);
        await waitFor(() =>
          access(join(directory, "lifecycle.lock"))
            .then(() => true)
            .catch(() => false),
        );
        await writeFile(`${barrier}.continue`, "continue\n");
        await waitFor(() =>
          access(`${disconnectBarrier}.ready`)
            .then(() => true)
            .catch(() => false),
        );
      } else {
        disconnect = spawnStateChild("disconnect-local", "remove_after_lock");
        await waitFor(() =>
          access(`${barrier}.ready`)
            .then(() => true)
            .catch(() => false),
        );
        recovery = spawnStateChild("recover-optional");
        await delay(50);
        assert.equal(recovery.child.exitCode, null, "recovery did not wait for disconnect lock");
      }

      const hook = await runWithInput(
        ["hook", "--source", clientSourceId, "--agent", "claude_code"],
        environment,
        '{"private":"discarded"}',
      );
      assert.equal(hook.code, 0);
      await writeFile(
        `${order === "recovery-first" ? disconnectBarrier : barrier}.continue`,
        "continue\n",
      );
      const [recoveryResult, disconnectResult] = await Promise.all([
        recovery.result,
        disconnect.result,
      ]);
      assert.deepEqual(recoveryResult, { code: 0, stderr: "" });
      assert.deepEqual(disconnectResult, { code: 0, stderr: "" });

      for (const name of [
        "config.json",
        "connection-commit.json",
        "connection-state.lock",
        "dirty.json",
        "scheduler.lock",
        "lifecycle.lock",
        "lifecycle-revoking.lock",
      ])
        await assert.rejects(access(join(directory, name)), undefined, name);
      assert.deepEqual(
        (await readdir(join(directory, "pending"))).filter((name) => name.endsWith(".json")),
        [],
      );
      assert.doesNotMatch(await readFile(join(hookRoot, "settings.json"), "utf8"), /viberacing/);
    } finally {
      restoreEnvironment();
      recovery?.child.kill();
      disconnect?.child.kill();
      await rm(home, { recursive: true, force: true });
    }
  }
});

test("keeps a manual Qwen hook root through reconnect and uninstall", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-qwen-hook-root-"));
  context.after(() => rm(home, { force: true, recursive: true }));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const qwenHome = join(home, ".qwen");
    const runtimeRoot = join(home, "qwen-runtime");
    const usageRoot = join(runtimeRoot, "usage");
    await mkdir(qwenHome, { recursive: true });
    await mkdir(usageRoot, { recursive: true });
    await writeFile(
      join(qwenHome, "settings.json"),
      `{
        // Preserve this user comment.
        "advanced": { "runtimeOutputDir": ${JSON.stringify(runtimeRoot)} },
        "unknownSetting": { "keep": true }
      }\n`,
    );

    await execFileAsync(
      process.execPath,
      [
        connectorPath,
        "source",
        "add",
        "--agent",
        "qwen_code",
        "--name",
        "Work",
        "--data-dir",
        usageRoot,
      ],
      { env: connectorEnvironment(home, { PATH: "" }) },
    );
    let sources = await readLocalSources(join(home, ".viberacing"));
    assert.equal(sources.length, 1);
    assert.equal(sources[0].dataPath, usageRoot);
    assert.equal(sources[0].hookConfigRoot, qwenHome);

    const module = await import(`../lib/config.mjs?qwen-hook-root=${encodeURIComponent(home)}`);
    await module.reconcileDetectedSources([
      {
        agentId: "qwen_code",
        dataPath: usageRoot,
        hookConfigRoot: qwenHome,
        collectionMethod: "qwen_stats_jsonl",
        supportedSurface: "cli",
        suggestedLabel: "Qwen Code",
      },
    ]);
    sources = await module.readSources();
    assert.equal(sources[0].hookConfigRoot, qwenHome);
    await module.installHooks(new URL("../bin/viberacing.mjs", import.meta.url), sources);
    const installed = await readFile(join(qwenHome, "settings.json"), "utf8");
    assert.match(installed, /Preserve this user comment/);
    assert.match(installed, /"unknownSetting"[\s\S]*"keep": true/);
    assert.match(installed, /viberacing-hook-v3:/);
    assert.match(installed, /--source/);
    assert.match(installed, new RegExp(sources[0].clientSourceId));
    assert.match(installed, /--agent/);
    assert.match(installed, /qwen_code/);
    await assert.rejects(access(join(runtimeRoot, "settings.json")));
    assert.deepEqual(await module.diagnoseHooks(sources), { qwen_code: "current" });

    const removed = await module.removeHooks();
    assert.equal(removed.failures.length, 0);
    const cleaned = await readFile(join(qwenHome, "settings.json"), "utf8");
    assert.match(cleaned, /Preserve this user comment/);
    assert.match(cleaned, /"unknownSetting"[\s\S]*"keep": true/);
    assert.doesNotMatch(cleaned, /viberacing-hook-v3:/);
  } finally {
    restoreEnvironment();
  }
});

test("reports invalid existing hook settings instead of claiming success", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-connector-invalid-settings-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    await mkdir(join(home, ".claude"));
    await writeFile(join(home, ".claude", "settings.json"), "{not-json");
    const module = await import(`../lib/config.mjs?invalid-home=${encodeURIComponent(home)}`);
    await assert.rejects(
      module.installHooks(new URL("../bin/viberacing.mjs", import.meta.url), [
        source("claude_code"),
      ]),
      /Cannot read hook settings/,
    );
  } finally {
    restoreEnvironment();
  }
});

test("reconciles healthy hooks when another source settings file is damaged", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-best-effort-hooks-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?best-effort=${encodeURIComponent(home)}`);
    const broken = {
      ...source("claude_code"),
      dataPath: join(home, "broken-claude", "projects"),
    };
    const healthy = {
      ...source("qwen_code"),
      dataPath: join(home, "healthy-qwen", "usage"),
      hookConfigRoot: join(home, "healthy-qwen"),
    };
    await mkdir(join(home, "broken-claude"), { recursive: true });
    await writeFile(join(home, "broken-claude", "settings.json"), "{not-json");
    const result = await module.reconcileHooks(
      new URL("../bin/viberacing.mjs", import.meta.url),
      [broken, healthy],
      [broken, healthy],
    );
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].clientSourceId, broken.clientSourceId);
    assert.match(
      await readFile(join(home, "healthy-qwen", "settings.json"), "utf8"),
      /viberacing-hook-v3/,
    );
  } finally {
    restoreEnvironment();
  }
});

test("source-owned hooks reconcile profiles independently and upgrade legacy markers", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-source-hooks-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?source-hooks=${encodeURIComponent(home)}`);
    const first = {
      clientSourceId: "71717171-7171-4171-8171-717171717171",
      agentId: "qwen_code",
      dataPath: join(home, "qwen-personal"),
      hookConfigRoot: join(home, "qwen-personal"),
      collectionMethod: "qwen_stats_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Personal",
    };
    const second = {
      ...first,
      clientSourceId: "72727272-7272-4272-8272-727272727272",
      dataPath: join(home, "qwen-work"),
      hookConfigRoot: join(home, "qwen-work"),
      suggestedLabel: "Work",
    };
    for (const profile of [first, second]) {
      await mkdir(profile.dataPath, { recursive: true });
      await writeFile(
        join(profile.dataPath, "settings.json"),
        JSON.stringify({
          hooks: {
            SessionEnd: [
              { hooks: [{ type: "command", command: "keep-foreign-hook" }] },
              ...(profile === first
                ? [
                    {
                      hooks: [
                        {
                          type: "command",
                          command: `node old hook ${module.legacyHookMarker}`,
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
        }),
      );
    }
    await module.reconcileHooks(
      new URL("../bin/viberacing.mjs", import.meta.url),
      [first, second],
      [first, second],
    );
    const firstSettings = await readFile(join(first.dataPath, "settings.json"), "utf8");
    const secondSettings = await readFile(join(second.dataPath, "settings.json"), "utf8");
    assert.match(firstSettings, new RegExp(module.hookMarkerForSource(first.clientSourceId)));
    assert.match(firstSettings, /--source/);
    assert.match(firstSettings, new RegExp(first.clientSourceId));
    assert.match(secondSettings, new RegExp(module.hookMarkerForSource(second.clientSourceId)));
    assert.match(secondSettings, /--source/);
    assert.match(secondSettings, new RegExp(second.clientSourceId));
    assert.doesNotMatch(firstSettings, /viberacing-hook-v2/);
    assert.match(firstSettings, /keep-foreign-hook/);

    await module.removeHookForSource(first);
    assert.doesNotMatch(
      await readFile(join(first.dataPath, "settings.json"), "utf8"),
      new RegExp(module.hookMarkerForSource(first.clientSourceId)),
    );
    assert.match(
      await readFile(join(second.dataPath, "settings.json"), "utf8"),
      new RegExp(module.hookMarkerForSource(second.clientSourceId)),
    );
    assert.equal(await module.diagnoseHookForSource(first), "missing");
    await module.reconcileHooks(
      new URL("../bin/viberacing.mjs", import.meta.url),
      [first],
      [first, second],
    );
    assert.equal(await module.diagnoseHookForSource(first), "current");
    assert.equal(await module.diagnoseHookForSource(second), "missing");
    assert.match(
      await readFile(join(second.dataPath, "settings.json"), "utf8"),
      /keep-foreign-hook/,
    );
  } finally {
    restoreEnvironment();
  }
});

test("keeps installation identity stable and pairing state separate", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-connector-identity-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?identity-home=${encodeURIComponent(home)}`);
    const first = await module.readOrCreateInstallation();
    const second = await module.readOrCreateInstallation();
    assert.deepEqual(second, first);
    assert.match(first.id, /^[0-9a-f-]{36}$/);
    await module.writeConfig({ version: 2, origin: "https://example.test", sources: [] });
    assert.equal((await module.readConfig()).origin, "https://example.test");
    if (process.platform !== "win32") {
      assert.equal((await stat(join(home, ".viberacing"))).mode & 0o777, 0o700);
      assert.equal((await stat(join(home, ".viberacing", "config.json"))).mode & 0o777, 0o600);
      assert.equal(
        (await stat(join(home, ".viberacing", "installation.json"))).mode & 0o777,
        0o600,
      );
    }
    await mkdir(join(home, ".viberacing", "pending"));
    await writeFile(join(home, ".viberacing", "state.json"), "{}\n");
    await writeFile(join(home, ".viberacing", "pending", "stale.json"), "{}\n");
    await module.resetInstallation();
    await assert.rejects(access(join(home, ".viberacing", "config.json")));
    await assert.rejects(access(join(home, ".viberacing", "installation.json")));
    await assert.rejects(access(join(home, ".viberacing", "state.json")));
    await assert.rejects(access(join(home, ".viberacing", "pending")));
  } finally {
    restoreEnvironment();
  }
});

test("an interrupted atomic config commit preserves the prior device token", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-config-atomic-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?atomic-config=${encodeURIComponent(home)}`);
    const previous = {
      version: 2,
      origin: "https://example.test",
      installationId: "91919191-9191-4191-8191-919191919191",
      deviceToken: "previous_device_token_that_is_long_enough_12",
      sources: [],
    };
    await module.writeConfig(previous);
    const before = await readFile(join(home, ".viberacing", "config.json"));
    await assert.rejects(
      module.writeConfig(
        {
          ...previous,
          deviceToken: "replacement_device_token_that_is_long_enough",
        },
        {
          beforeRename() {
            throw new Error("synthetic interruption before config rename");
          },
        },
      ),
      /synthetic interruption/,
    );
    assert.deepEqual(await readFile(join(home, ".viberacing", "config.json")), before);
    assert.deepEqual(
      (await readdir(join(home, ".viberacing"))).filter((name) => name.endsWith(".tmp")),
      [],
    );
  } finally {
    restoreEnvironment();
    await rm(home, { recursive: true, force: true });
  }
});

test("keeps source UUIDs stable when detected path order changes", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-stable-sources-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?stable-sources=${encodeURIComponent(home)}`);
    const firstPath = join(home, "opencode-a.db");
    const secondPath = join(home, "opencode-b.db");
    const shape = (dataPath, label) => ({
      agentId: "opencode",
      collectionMethod: "opencode_sqlite",
      dataPath,
      suggestedLabel: label,
      supportedSurface: "cli",
    });
    const first = await module.reconcileDetectedSources([
      shape(firstPath, "First"),
      shape(secondPath, "Second"),
    ]);
    const firstIds = new Map(first.map((item) => [item.dataPath, item.clientSourceId]));
    const reordered = await module.reconcileDetectedSources([
      shape(secondPath, "Second"),
      shape(firstPath, "First"),
      shape(firstPath, "Duplicate"),
    ]);
    assert.equal(reordered.length, 2);
    assert.equal(
      reordered.find((item) => item.dataPath === firstPath).clientSourceId,
      firstIds.get(firstPath),
    );
    assert.equal(
      reordered.find((item) => item.dataPath === secondPath).clientSourceId,
      firstIds.get(secondPath),
    );
  } finally {
    restoreEnvironment();
  }
});

test("migrates only legacy auto-generated OpenCode labels", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-opencode-label-migration-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?opencode-labels=${encodeURIComponent(home)}`);
    const legacyPath = join(home, "opencode-custom-channel.db");
    const customPath = join(home, "opencode-personal.db");
    await module.writeSources([
      {
        clientSourceId: "51515151-5151-4151-8151-515151515151",
        agentId: "opencode",
        collectionMethod: "opencode_sqlite",
        dataPath: legacyPath,
        suggestedLabel: "OpenCode custom-channel",
        supportedSurface: "cli",
      },
      {
        clientSourceId: "52525252-5252-4252-8252-525252525252",
        agentId: "opencode",
        collectionMethod: "opencode_sqlite",
        dataPath: customPath,
        suggestedLabel: "My private profile",
        supportedSurface: "cli",
      },
    ]);

    const reconciled = await module.reconcileDetectedSources([
      {
        agentId: "opencode",
        collectionMethod: "opencode_sqlite",
        dataPath: legacyPath,
        suggestedLabel: "OpenCode profile 2",
        legacyAutoSuggestedLabel: "OpenCode custom-channel",
        supportedSurface: "cli",
      },
      {
        agentId: "opencode",
        collectionMethod: "opencode_sqlite",
        dataPath: customPath,
        suggestedLabel: "OpenCode profile 3",
        legacyAutoSuggestedLabel: "OpenCode personal",
        supportedSurface: "cli",
      },
    ]);

    assert.equal(reconciled[0].suggestedLabel, "OpenCode profile 2");
    assert.equal(reconciled[1].suggestedLabel, "My private profile");
    assert.deepEqual(
      (await module.readSources()).map((source) => source.suggestedLabel),
      ["OpenCode profile 2", "My private profile"],
    );
  } finally {
    restoreEnvironment();
    await rm(home, { recursive: true, force: true });
  }
});

test("deduplicates a configured token root through its symlink without changing display path", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-symlink-source-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?symlink-source=${encodeURIComponent(home)}`);
    const root = join(home, "usage-root");
    const alias = join(home, "usage-alias");
    await mkdir(root);
    await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
    const direct = await module.addSource({
      agentId: "claude_code",
      collectionMethod: "claude_jsonl",
      dataPath: root,
      suggestedLabel: "Claude",
      supportedSurface: "cli",
    });
    const duplicate = await module.addSource({
      agentId: "claude_code",
      collectionMethod: "claude_jsonl",
      dataPath: alias,
      suggestedLabel: "Claude alias",
      supportedSurface: "cli",
    });
    assert.equal(direct.added, true);
    assert.equal(duplicate.added, false);
    assert.equal(duplicate.source.clientSourceId, direct.source.clientSourceId);
    assert.equal((await module.readSources())[0].dataPath, root);
  } finally {
    restoreEnvironment();
  }
});

test("prefers the current Kimi root and removes the auto-added default legacy root", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-kimi-preference-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(`../lib/config.mjs?kimi-preference=${encodeURIComponent(home)}`);
    await module.writeSources([
      {
        clientSourceId: "81818181-8181-4181-8181-818181818181",
        agentId: "kimi_code",
        collectionMethod: "kimi_wire_jsonl",
        dataPath: join(home, ".kimi", "sessions"),
        suggestedLabel: "Kimi Code",
        supportedSurface: "cli",
      },
      {
        clientSourceId: "82828282-8282-4282-8282-828282828282",
        agentId: "kimi_code",
        collectionMethod: "kimi_legacy_wire_jsonl",
        dataPath: join(home, "archived-kimi", "sessions"),
        suggestedLabel: "Kimi archive",
        supportedSurface: "cli",
      },
    ]);
    const detected = [
      {
        agentId: "kimi_code",
        collectionMethod: "kimi_wire_jsonl",
        dataPath: join(home, ".kimi-code", "sessions"),
        suggestedLabel: "Kimi Code",
        supportedSurface: "cli",
        supersedesDataPaths: [join(home, ".kimi", "sessions")],
      },
    ];
    const preview = await module.reconcileDetectedSources(detected, { persist: false });
    assert.deepEqual(
      preview.map((source) => source.dataPath).sort(),
      [join(home, ".kimi-code", "sessions"), join(home, "archived-kimi", "sessions")].sort(),
    );
    assert.deepEqual(
      (await module.readSources()).map((source) => source.dataPath).sort(),
      [join(home, ".kimi", "sessions"), join(home, "archived-kimi", "sessions")].sort(),
    );
    const sources = await module.reconcileDetectedSources(detected);
    assert.deepEqual(
      sources.map((source) => source.dataPath).sort(),
      [join(home, ".kimi-code", "sessions"), join(home, "archived-kimi", "sessions")].sort(),
    );
  } finally {
    restoreEnvironment();
  }
});

test("persists a resolved portable executable only in local source metadata", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-portable-executable-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(
      `../lib/config.mjs?portable-executable=${encodeURIComponent(home)}`
    );
    const clientSourceId = "83838383-8383-4383-8383-838383838383";
    await module.writeSources([
      {
        clientSourceId,
        agentId: "codex",
        collectionMethod: "codex_app_server",
        dataPath: join(home, ".codex"),
        suggestedLabel: "Codex",
        supportedSurface: "desktop",
      },
    ]);
    const portable = join(home, "portable", "codex");
    assert.equal(await module.rememberSourceExecutable(clientSourceId, portable), true);
    assert.equal((await module.readSources())[0].executablePath, portable);
    await module.writeConfig({
      version: 2,
      origin: "https://example.test",
      sources: [
        {
          clientSourceId,
          sourceId: "84848484-8484-4484-8484-848484848484",
          agentAccountId: "85858585-8585-4585-8585-858585858585",
          agentId: "codex",
          accountLabel: "Codex",
          collectionMethod: "codex_app_server",
        },
      ],
    });
    assert.doesNotMatch(
      await readFile(join(home, ".viberacing", "config.json"), "utf8"),
      /portable/,
    );
    assert.equal((await module.readConfig()).sources[0].executablePath, portable);
  } finally {
    restoreEnvironment();
  }
});

test("refreshes the executable path of an existing detected source", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-existing-executable-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const module = await import(
      `../lib/config.mjs?existing-executable=${encodeURIComponent(home)}`
    );
    const clientSourceId = "86868686-8686-4686-8686-868686868686";
    const dataPath = join(home, ".codex");
    await module.writeSources([
      {
        clientSourceId,
        agentId: "codex",
        collectionMethod: "codex_app_server",
        dataPath,
        suggestedLabel: "Codex",
        supportedSurface: "desktop",
      },
    ]);
    const executablePath = join(home, "portable", "codex");
    const sources = await module.reconcileDetectedSources([
      {
        agentId: "codex",
        collectionMethod: "codex_app_server",
        dataPath,
        executablePath,
        suggestedLabel: "Codex",
        supportedSurface: "desktop",
      },
    ]);
    assert.equal(sources[0].clientSourceId, clientSourceId);
    assert.equal(sources[0].executablePath, executablePath);
    assert.equal((await module.readSources())[0].executablePath, executablePath);
  } finally {
    restoreEnvironment();
  }
});

test("prevents overlapping syncs with an atomic lock", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-runtime-lock-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const runtime = await import(`../lib/runtime.mjs?lock-home=${encodeURIComponent(home)}`);
    let release;
    const first = runtime.withSyncLock(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(await runtime.withSyncLock(() => "should-not-run"), { skipped: true });
    release("done");
    assert.equal(await first, "done");
    const sourceId = "11111111-1111-4111-8111-111111111111";
    await runtime.savePending({
      protocolVersion: 2,
      snapshots: [{ sourceId, syncSequence: "1", entries: [] }],
    });
    await runtime.savePending({
      protocolVersion: 2,
      snapshots: [{ sourceId, syncSequence: "2", entries: [] }],
    });
    const pending = await runtime.pendingPayloads();
    assert.equal(pending.length, 1);
    assert.equal((await runtime.readPending(pending[0])).snapshots[0].syncSequence, "2");
    const errorSourceId = "22222222-2222-4222-8222-222222222222";
    await runtime.savePending({
      protocolVersion: 2,
      snapshots: [],
      sourceErrors: [{ sourceId: errorSourceId, code: "collector_failed" }],
    });
    const payloads = await Promise.all(
      (await runtime.pendingPayloads()).map((path) => runtime.readPending(path)),
    );
    assert.deepEqual(runtime.mergePendingPayloads(payloads), {
      protocolVersion: 2,
      snapshots: [{ sourceId, syncSequence: "2", entries: [] }],
      sourceErrors: [{ sourceId: errorSourceId, code: "collector_failed" }],
    });
    const maximumBatch = runtime.mergePendingPayloads(
      Array.from({ length: 32 }, (_, index) => ({
        protocolVersion: 2,
        snapshots: [{ sourceId: `source-${index}`, syncSequence: "1", entries: [] }],
        sourceErrors: [],
      })),
    );
    assert.equal(maximumBatch.snapshots.length, 32);
    assert.equal(maximumBatch.sourceErrors.length, 0);
    await runtime.removePendingForSource(errorSourceId);
    assert.equal((await runtime.pendingPayloads()).length, 1);
  } finally {
    restoreEnvironment();
  }
});

test("manual sync reports a busy lock after a bounded wait", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-manual-sync-busy-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, "http://127.0.0.1:1");
  await writeFile(join(installation.directory, "sync.lock"), "synthetic-owner\n");

  const startedAt = Date.now();
  await assert.rejects(
    execFileAsync(process.execPath, [connectorPath, "sync"], {
      env: connectorEnvironment(home, {
        NODE_ENV: "test",
        VIBERACING_TEST_MANUAL_SYNC_LOCK_WAIT_MS: "100",
      }),
    }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Another sync is already running\./);
      return true;
    },
  );
  assert.ok(Date.now() - startedAt >= 80);
});

test("coalesces dirty events with debounce, cooldown, and a bounded maximum delay", async () => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-auto-dirty-"));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const runtime = await import(`../lib/runtime.mjs?auto-dirty=${encodeURIComponent(home)}`);
    const start = Date.parse("2026-08-14T08:00:00.000Z");
    const clientSourceId = "12121212-1212-4121-8121-121212121212";
    for (let index = 0; index < 20; index += 1) {
      await runtime.markDirty(clientSourceId, new Date(start + index * 1_500));
    }
    const dirty = await runtime.readDirty();
    const entry = dirty.sources[clientSourceId];
    assert.equal(entry.dirtySince, new Date(start).toISOString());
    assert.equal(entry.lastEventAt, new Date(start + 28_500).toISOString());
    assert.equal(runtime.automaticDueAt(dirty), start + 43_500);
    const delayed = structuredClone(dirty);
    delayed.sources[clientSourceId].lastEventAt = new Date(start + 300_000).toISOString();
    assert.equal(runtime.automaticDueAt(delayed, 0), start + 120_000);
    assert.equal(runtime.automaticDueAt(dirty, start + 50_000), start + 170_000);
    const secondSourceId = "23232323-2323-4232-8232-232323232323";
    await Promise.all([
      runtime.markDirty(clientSourceId, new Date(start + 30_000)),
      runtime.markDirty(secondSourceId, new Date(start + 30_000)),
    ]);
    const concurrent = await runtime.readDirty();
    assert.deepEqual(
      new Set(runtime.dirtyEntries(concurrent).map(([id]) => id)),
      new Set([clientSourceId, secondSourceId]),
    );
    const claims = runtime.dirtyClaims(concurrent);
    await runtime.markDirty(clientSourceId, new Date(start + 31_000));
    await runtime.clearDirty(claims);
    assert.deepEqual(
      runtime.dirtyEntries(await runtime.readDirty()).map(([id]) => id),
      [clientSourceId],
    );
    assert.deepEqual(
      runtime.configuredAutomaticSyncTimings({
        NODE_ENV: "test",
        VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "25,200,200",
      }),
      { debounceMs: 25, minimumIntervalMs: 200, maximumDelayMs: 200 },
    );
    assert.equal(
      runtime.configuredAutomaticSyncTimings({
        NODE_ENV: "production",
        VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "1,1,1",
      }),
      runtime.automaticSyncTimings,
    );
    const firstScheduler = await runtime.claimScheduler();
    assert.equal(typeof firstScheduler.ownershipToken, "string");
    assert.equal(await runtime.claimScheduler(), false);
    assert.equal(await runtime.ownsScheduler(firstScheduler), true);
    assert.equal(await runtime.releaseScheduler(firstScheduler), true);
    const { stateDirectory } = await import("../lib/config.mjs");
    const staleLock = join(stateDirectory, "scheduler.lock");
    const staleOwner = "stale-owner";
    await writeFile(staleLock, `99999999:${staleOwner}\n`);
    const staleTime = new Date(Date.now() - 11 * 60_000);
    await utimes(staleLock, staleTime, staleTime);
    const replacementScheduler = await runtime.claimScheduler();
    assert.equal(typeof replacementScheduler.ownershipToken, "string");
    assert.equal(
      await runtime.releaseScheduler({ ...replacementScheduler, owner: staleOwner }),
      false,
    );
    assert.equal(await runtime.ownsScheduler(replacementScheduler), true);
    await runtime.releaseScheduler(replacementScheduler);
  } finally {
    restoreEnvironment();
  }
});

test("capture compaction keeps only recent allowlisted usage metadata", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-capture-compaction-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const restoreEnvironment = useModuleEnvironment(home);
  try {
    const runtime = await import(`../lib/runtime.mjs?capture=${encodeURIComponent(home)}`);
    const path = join(home, "capture.jsonl");
    const usage = (date) => ({
      id: `event-${date}`,
      date,
      usage: { date, totalTokens: "12", inputTokens: "5", outputTokens: "7" },
      prompt: "must-not-survive",
    });
    await writeFile(
      path,
      `${JSON.stringify(usage("2026-07-09"))}\n${JSON.stringify(usage("2026-08-10"))}\n`,
    );
    assert.equal(await runtime.compactCapture(path, new Date("2026-08-14T12:00:00Z"), 1), true);
    const compacted = await readFile(path, "utf8");
    assert.doesNotMatch(compacted, /2026-07-09|prompt|must-not-survive/);
    assert.match(compacted, /2026-08-10/);
    assert.equal(await runtime.compactCapture(path, new Date("2026-08-14T12:00:00Z")), false);
  } finally {
    restoreEnvironment();
  }
});

test("capture compaction serializes concurrent safe appends", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-capture-lock-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const runtimeUrl = pathToFileURL(
    fileURLToPath(new URL("../lib/runtime.mjs", import.meta.url)),
  ).href;
  const script = `
    import { appendCapture, compactCapture } from ${JSON.stringify(runtimeUrl)};
    import { join } from "node:path";
    const date = "2026-08-10";
    const path = join(process.env.VIBERACING_STATE_DIR, "captures", "34343434-3434-4343-8343-343434343434.jsonl");
    const source = { agentId: "antigravity", clientSourceId: "34343434-3434-4343-8343-343434343434", dataPath: path };
    const usage = (id) => ({ id, date, usage: { date, totalTokens: "12", inputTokens: "5", outputTokens: "7" } });
    await appendCapture(source, [usage("initial")]);
    await Promise.all([
      ...Array.from({ length: 20 }, (_, index) => appendCapture(source, [usage(\`concurrent-\${index}\`)])),
      ...Array.from({ length: 5 }, () => compactCapture(path, new Date("2026-08-14T12:00:00Z"), 1)),
    ]);
  `;
  await execFileAsync(process.execPath, ["--input-type=module", "--eval", script], {
    env: connectorEnvironment(home),
  });
  const path = join(home, ".viberacing", "captures", "34343434-3434-4343-8343-343434343434.jsonl");
  const ids = (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).id)
    .sort();
  assert.deepEqual(
    ids,
    ["initial", ...Array.from({ length: 20 }, (_, index) => `concurrent-${index}`)].sort(),
  );
  await assert.rejects(access(`${path}.lock`));
});

test("hook discards stdin, emits only contract JSON, and fails open", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-hook-lightweight-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const blockedState = join(home, "state-is-a-file");
  await writeFile(blockedState, "not a directory");
  const result = await runWithInput(
    ["hook", "--agent", "qwen_code"],
    { ...connectorEnvironment(home), VIBERACING_STATE_DIR: blockedState },
    '{"prompt":"synthetic-private-prompt","cwd":"/synthetic/private/path"}',
  );
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "{}\n");
  assert.equal(result.stderr, "");
  assert.equal(await readFile(blockedState, "utf8"), "not a directory");
});

test("a provider hook that receives EOF after uninstall does not recreate state", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-late-hook-uninstall-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const clientSourceId = "91919191-9191-4191-8191-919191919191";
  const sourceId = "92929292-9292-4292-8292-929292929292";
  const claudeRoot = join(home, ".claude");
  const directory = await writeMappedInstallation(home, "http://127.0.0.1:9", [
    {
      clientSourceId,
      sourceId,
      agentId: "claude_code",
      collectionMethod: "claude_jsonl",
      dataPath: claudeRoot,
      hookConfigRoot: claudeRoot,
      suggestedLabel: "Claude",
      supportedSurface: "cli",
    },
  ]);
  const ready = join(home, "hook.ready");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_HOOK_READY: ready,
  });
  const hook = spawn(
    process.execPath,
    [connectorPath, "hook", "--source", clientSourceId, "--agent", "claude_code"],
    { env: environment, stdio: ["pipe", "pipe", "pipe"] },
  );
  context.after(() => hook.kill());
  let stdout = "";
  let stderr = "";
  hook.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  hook.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  await waitFor(() =>
    access(ready)
      .then(() => true)
      .catch(() => false),
  );

  const uninstall = await execFileAsync(process.execPath, [connectorPath, "uninstall"], {
    env: environment,
  });
  assert.match(uninstall.stdout, /local state removed/);
  await assert.rejects(access(directory), { code: "ENOENT" });

  hook.stdin.end('{"private":"must never be logged"}\n');
  const [code] = await once(hook, "close");
  assert.equal(code, 0);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
  await assert.rejects(access(directory), { code: "ENOENT" });
  for (const name of [
    ".viberacing-state",
    "scheduler.lock",
    "scheduler-launch.lock",
    "lifecycle.lock",
    "lifecycle-revoking.lock",
    "connection-state.lock",
  ])
    await assert.rejects(access(join(directory, name)), { code: "ENOENT" }, name);
  assert.deepEqual(
    (await readdir(home)).filter((name) => /(?:\.recovery|\.stale\.)/i.test(name)),
    [],
  );
});

test("claiming the scheduler launch gate does not initialize missing state", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-missing-launch-state-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const directory = join(home, ".viberacing");
  const runtimeUrl = pathToFileURL(
    fileURLToPath(new URL("../lib/runtime.mjs", import.meta.url)),
  ).href;
  const result = await execFileAsync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { claimSchedulerLaunch } from ${JSON.stringify(runtimeUrl)}; process.stdout.write(String(await claimSchedulerLaunch({ waitMs: 0 })));`,
    ],
    { env: connectorEnvironment(home, { NODE_ENV: "test" }) },
  );
  assert.equal(result.stdout, "null");
  assert.equal(result.stderr, "");
  await assert.rejects(access(directory), { code: "ENOENT" });
});

test("the detached scheduler child owns its lock and later launchers exit", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-scheduler-owner-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, "http://127.0.0.1:9");
  const trace = join(home, "scheduler-processes.log");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "5000,5000,5000",
    VIBERACING_TEST_SCHEDULER_TRACE: trace,
  });
  const hookArguments = ["hook", "--source", installation.clientSourceId, "--agent", "antigravity"];

  const firstHook = await runWithInput(hookArguments, environment, "{}");
  assert.equal(firstHook.code, 0);
  await waitFor(async () => (await readFile(trace, "utf8").catch(() => "")).includes("acquired:"));
  const firstOwner = await readFile(join(installation.directory, "scheduler.lock"), "utf8");
  const ownerPid = Number(firstOwner.split(":", 1)[0]);
  assert.notEqual(ownerPid, firstHook.pid);
  process.kill(ownerPid, 0);

  const secondHook = await runWithInput(hookArguments, environment, "{}");
  assert.equal(secondHook.code, 0);
  await waitFor(async () => (await readFile(trace, "utf8")).includes("lost:"));
  assert.equal(await readFile(join(installation.directory, "scheduler.lock"), "utf8"), firstOwner);
  const lostPid = Number(
    (await readFile(trace, "utf8"))
      .trim()
      .split("\n")
      .find((line) => line.startsWith("lost:"))
      .split(":", 2)[1],
  );
  await waitFor(() => {
    try {
      process.kill(lostPid, 0);
      return false;
    } catch (error) {
      return error?.code === "ESRCH";
    }
  });

  await execFileAsync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { clearAutomaticState } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL("../lib/runtime.mjs", import.meta.url))).href)}; await clearAutomaticState();`,
    ],
    { env: environment },
  );
  await assert.rejects(access(join(installation.directory, "scheduler.lock")));
  assert.match(await readFile(trace, "utf8"), new RegExp(`released:${ownerPid}`));
});

test("uninstall waits for a scheduler child paused before lock acquisition", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-uninstall-scheduler-launch-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const installation = await writeCaptureInstallation(home, "http://127.0.0.1:9");
  const barrier = join(home, "scheduler-claim");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_SCHEDULER_CLAIM_BARRIER: barrier,
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "5000,5000,5000",
  });
  const hook = spawn(
    process.execPath,
    [connectorPath, "hook", "--source", installation.clientSourceId, "--agent", "antigravity"],
    { env: environment, stdio: ["pipe", "pipe", "pipe"] },
  );
  hook.stdin.end("{}\n");
  await waitFor(() =>
    access(`${barrier}.ready`)
      .then(() => true)
      .catch(() => false),
  );

  const uninstall = execFileAsync(process.execPath, [connectorPath, "uninstall"], {
    env: environment,
  });
  await waitFor(() =>
    access(join(installation.directory, "lifecycle.lock"))
      .then(() => true)
      .catch(() => false),
  );
  await writeFile(`${barrier}.continue`, "continue\n");
  const [hookCode] = await once(hook, "close");
  assert.equal(hookCode, 0);
  const uninstallResult = await uninstall;
  assert.match(uninstallResult.stdout, /local state removed/);
  await delay(100);
  await assert.rejects(access(installation.directory), { code: "ENOENT" });
  assert.deepEqual(
    (await readdir(home)).filter((name) => /(?:scheduler.*\.lock|recovery)/i.test(name)),
    [],
  );
});

test("real hooks coalesce into one batch and preserve an event arriving during sync", async (context) => {
  const bodies = [];
  const requestTimes = [];
  let firstRequestStarted;
  let releaseFirstResponse;
  const firstRequest = new Promise((resolve) => {
    firstRequestStarted = resolve;
  });
  const firstResponseCanFinish = new Promise((resolve) => {
    releaseFirstResponse = resolve;
  });
  context.after(() => releaseFirstResponse());
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (request.method !== "POST" || request.url !== "/api/usage") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      bodies.push(body);
      requestTimes.push(Date.now());
      if (bodies.length === 1) firstRequestStarted();
      const finish = () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(usageResponse(body)));
      };
      if (bodies.length === 1) firstResponseCanFinish.then(finish);
      else finish();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-real-scheduler-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  await writeFile(
    join(installation.directory, "state.json"),
    `${JSON.stringify({ version: 1, sequences: { [installation.sourceId]: "0" } })}\n`,
  );
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "50,400,200",
  });

  const hookResults = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      runWithInput(
        ["hook", "--source", installation.clientSourceId, "--agent", "antigravity"],
        environment,
        JSON.stringify({ prompt: `private-${index}`, cwd: `/private/${index}` }),
      ),
    ),
  );
  for (const [index, result] of hookResults.entries()) {
    assert.equal(
      result.code,
      0,
      `hook ${index} failed: stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}`,
    );
    assert.equal(result.stdout, "", `hook ${index} unexpectedly wrote to stdout`);
  }
  await firstRequest;
  const firstAutomaticSyncAt = JSON.parse(
    await readFile(join(installation.directory, "state.json"), "utf8"),
  ).lastAutomaticSyncAt;
  assert.equal(typeof firstAutomaticSyncAt, "number");

  const appendScript = `
    import { appendCapture } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL("../lib/runtime.mjs", import.meta.url))).href)};
    const date = new Date().toISOString().slice(0, 10);
    await appendCapture({
      agentId: "antigravity",
      clientSourceId: ${JSON.stringify(installation.clientSourceId)},
      dataPath: ${JSON.stringify(installation.capture)},
    }, [{
      id: "event-during-sync",
      date,
      usage: { date, totalTokens: "5", inputTokens: "2", outputTokens: "3" },
    }]);
  `;
  await execFileAsync(process.execPath, ["--input-type=module", "--eval", appendScript], {
    env: environment,
  });
  const secondHook = await runWithInput(
    ["hook", "--source", installation.clientSourceId, "--agent", "antigravity"],
    environment,
    '{"prompt":"private-during-sync"}',
  );
  assert.equal(secondHook.code, 0);
  releaseFirstResponse();

  await waitFor(() => bodies.length === 2);
  await delay(250);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].snapshots.length, 1);
  assert.equal(bodies[1].snapshots.length, 1);
  assert.equal(bodies[1].snapshots[0].entries[0].totalTokens, "8");
  assert.ok(requestTimes[1] >= firstAutomaticSyncAt + 400);
  await waitFor(async () => {
    try {
      await access(join(installation.directory, "scheduler.lock"));
      return false;
    } catch {
      return true;
    }
  });
});

test("a failed collector gets one automatic attempt per hook generation", async (context) => {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/api/installations/current") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(reconciliationResponse([{ sourceId: source.sourceId }])));
      return;
    }
    request.resume();
    request.on("end", () => {
      requests += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify(
          usageResponse({ snapshots: [], sourceErrors: [{ sourceId: source.sourceId }] }),
        ),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-finite-collector-failure-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const source = {
    clientSourceId: "41414141-4141-4141-8141-414141414141",
    sourceId: "42424242-4242-4242-8242-424242424242",
    agentId: "claude_code",
    dataPath: join(home, "claude"),
    collectionMethod: "synthetic_invalid_collector",
    supportedSurface: "cli",
    suggestedLabel: "Broken collector",
  };
  const directory = await writeMappedInstallation(home, `http://127.0.0.1:${address.port}`, [
    source,
  ]);
  const trace = join(home, "collector-trace.txt");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_COLLECTOR_TRACE: trace,
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "20,80,40",
  });
  const hookArguments = ["hook", "--source", source.clientSourceId, "--agent", source.agentId];

  await runWithInput(hookArguments, environment, "{}");
  await waitFor(async () => {
    try {
      await access(join(directory, "scheduler.lock"));
      return false;
    } catch {
      return requests === 1;
    }
  });
  assert.deepEqual((await readFile(trace, "utf8")).trim().split("\n"), [source.clientSourceId]);
  await assert.rejects(access(join(directory, "dirty.json")));
  assert.equal(
    JSON.parse(await readFile(join(directory, "state.json"), "utf8")).fingerprints[source.sourceId]
      .length,
    64,
  );

  await delay(300);
  assert.equal(requests, 1);
  assert.equal((await readFile(trace, "utf8")).trim().split("\n").length, 1);

  await runWithInput(hookArguments, environment, "{}");
  await waitFor(async () => (await readFile(trace, "utf8")).trim().split("\n").length === 2);
  await waitFor(async () => {
    try {
      await access(join(directory, "scheduler.lock"));
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(requests, 1);
});

test("a permanent upload failure leaves one pending payload without background retries", async (context) => {
  let requests = 0;
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      requests += 1;
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "synthetic_unavailable" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-finite-upload-failure-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  const trace = join(home, "collector-trace.txt");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_COLLECTOR_TRACE: trace,
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "20,80,40",
  });
  const hookArguments = ["hook", "--source", installation.clientSourceId, "--agent", "antigravity"];

  await runWithInput(hookArguments, environment, "{}");
  await waitFor(() => requests === 3, 7_000);
  await waitFor(async () => {
    try {
      await access(join(installation.directory, "scheduler.lock"));
      return false;
    } catch {
      return true;
    }
  });
  assert.equal((await readFile(trace, "utf8")).trim().split("\n").length, 1);
  assert.equal((await readdir(join(installation.directory, "pending"))).length, 1);
  await assert.rejects(access(join(installation.directory, "dirty.json")));

  await delay(300);
  assert.equal(requests, 3);

  await runWithInput(hookArguments, environment, "{}");
  await waitFor(() => requests === 6, 7_000);
  await waitFor(async () => {
    try {
      await access(join(installation.directory, "scheduler.lock"));
      return false;
    } catch {
      return true;
    }
  });
  assert.equal((await readFile(trace, "utf8")).trim().split("\n").length, 1);
  assert.equal((await readdir(join(installation.directory, "pending"))).length, 1);
});

test("a Claude hook collects only its dirty source and unchanged data sends no HTTP", async (context) => {
  const bodies = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      bodies.push(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-targeted-claude-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const fixtureRoot = fileURLToPath(new URL("fixtures", import.meta.url));
  const sources = [
    {
      clientSourceId: "10101010-1010-4010-8010-101010101010",
      sourceId: "11111111-1010-4010-8010-101010101010",
      agentId: "claude_code",
      dataPath: fixtureRoot,
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Claude",
    },
    {
      clientSourceId: "20202020-2020-4020-8020-202020202020",
      sourceId: "22222222-2020-4020-8020-202020202020",
      agentId: "codex",
      dataPath: join(home, "codex-profile"),
      collectionMethod: "codex_app_server",
      supportedSurface: "cli",
      suggestedLabel: "Codex",
    },
    {
      clientSourceId: "30303030-3030-4030-8030-303030303030",
      sourceId: "33333333-3030-4030-8030-303030303030",
      agentId: "opencode",
      dataPath: join(home, "must-not-open.db"),
      collectionMethod: "opencode_sqlite",
      supportedSurface: "cli",
      suggestedLabel: "OpenCode",
    },
  ];
  const directory = await writeMappedInstallation(
    home,
    `http://127.0.0.1:${address.port}`,
    sources,
  );
  const bin = join(home, "bin");
  const codexLaunch = join(home, "codex-launched");
  await mkdir(bin);
  await writeFile(
    join(bin, "codex"),
    `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(codexLaunch)}, "launched");\n`,
  );
  await chmod(join(bin, "codex"), 0o700);
  const trace = join(home, "collector-trace.txt");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    VIBERACING_TEST_COLLECTOR_TRACE: trace,
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "25,150,100",
  });
  const hookArguments = ["hook", "--source", sources[0].clientSourceId, "--agent", "claude_code"];
  await runWithInput(hookArguments, environment, '{"prompt":"private"}');
  await waitFor(() => bodies.length === 1);
  assert.deepEqual((await readFile(trace, "utf8")).trim().split("\n"), [sources[0].clientSourceId]);
  assert.equal(bodies[0].snapshots.length, 1);
  assert.equal(bodies[0].snapshots[0].sourceId, sources[0].sourceId);
  await assert.rejects(access(codexLaunch));

  await runWithInput(hookArguments, environment, '{"response":"private"}');
  await waitFor(async () => (await readFile(trace, "utf8")).trim().split("\n").length === 2);
  await waitFor(async () => {
    try {
      await access(join(directory, "scheduler.lock"));
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(bodies.length, 1);
  assert.deepEqual((await readFile(trace, "utf8")).trim().split("\n"), [
    sources[0].clientSourceId,
    sources[0].clientSourceId,
  ]);
  await assert.rejects(access(codexLaunch));
});

test("events from Claude and Kimi coalesce without collecting other sources", async (context) => {
  const bodies = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      bodies.push(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-targeted-coalesced-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const fixtureRoot = fileURLToPath(new URL("fixtures", import.meta.url));
  const sources = [
    {
      clientSourceId: "40404040-4040-4040-8040-404040404040",
      sourceId: "44444444-4040-4040-8040-404040404040",
      agentId: "claude_code",
      dataPath: fixtureRoot,
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Claude",
    },
    {
      clientSourceId: "50505050-5050-4050-8050-505050505050",
      sourceId: "55555555-5050-4050-8050-505050505050",
      agentId: "kimi_code",
      dataPath: fixtureRoot,
      collectionMethod: "kimi_wire_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Kimi",
    },
    {
      clientSourceId: "60606060-6060-4060-8060-606060606060",
      sourceId: "66666666-6060-4060-8060-606060606060",
      agentId: "opencode",
      dataPath: join(home, "must-not-open.db"),
      collectionMethod: "opencode_sqlite",
      supportedSurface: "cli",
      suggestedLabel: "OpenCode",
    },
  ];
  const directory = await writeMappedInstallation(
    home,
    `http://127.0.0.1:${address.port}`,
    sources,
  );
  const trace = join(home, "collector-trace.txt");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_COLLECTOR_TRACE: trace,
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "1500,3000,3000",
  });
  const hookResults = await Promise.all(
    sources
      .slice(0, 2)
      .map((source) =>
        runWithInput(
          ["hook", "--source", source.clientSourceId, "--agent", source.agentId],
          environment,
          "{}",
        ),
      ),
  );
  assert.deepEqual(
    hookResults.map((result) => result.code),
    [0, 0],
  );
  const dirty = JSON.parse(await readFile(join(directory, "dirty.json"), "utf8"));
  assert.deepEqual(
    new Set(Object.keys(dirty.sources)),
    new Set(sources.slice(0, 2).map((source) => source.clientSourceId)),
  );
  await waitFor(() => bodies.length === 1, 10_000);
  assert.deepEqual(
    new Set((await readFile(trace, "utf8")).trim().split("\n")),
    new Set(sources.slice(0, 2).map((source) => source.clientSourceId)),
  );
  assert.deepEqual(
    new Set(bodies[0].snapshots.map((snapshot) => snapshot.sourceId)),
    new Set(sources.slice(0, 2).map((source) => source.sourceId)),
  );
  await waitFor(async () => {
    try {
      await access(join(directory, "scheduler.lock"));
      return false;
    } catch {
      return true;
    }
  });
});

test("a hook persists its event while another hook holds the scheduler launch gate", async (context) => {
  const bodies = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      bodies.push(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-hook-busy-launch-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const fixtureRoot = fileURLToPath(new URL("fixtures", import.meta.url));
  const sources = [
    {
      clientSourceId: "70707070-7070-4070-8070-707070707070",
      sourceId: "77777777-7070-4070-8070-707070707070",
      agentId: "claude_code",
      dataPath: fixtureRoot,
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Claude",
    },
    {
      clientSourceId: "80808080-8080-4080-8080-808080808080",
      sourceId: "88888888-8080-4080-8080-808080808080",
      agentId: "kimi_code",
      dataPath: fixtureRoot,
      collectionMethod: "kimi_wire_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Kimi",
    },
    {
      clientSourceId: "90909090-9090-4090-8090-909090909090",
      sourceId: "99999999-9090-4090-8090-909090909090",
      agentId: "opencode",
      dataPath: join(home, "must-not-open.db"),
      collectionMethod: "opencode_sqlite",
      supportedSurface: "cli",
      suggestedLabel: "OpenCode",
    },
  ];
  const directory = await writeMappedInstallation(
    home,
    `http://127.0.0.1:${address.port}`,
    sources,
  );
  const barrier = join(home, "scheduler-claim");
  const trace = join(home, "collector-trace.txt");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_SCHEDULER_CLAIM_BARRIER: barrier,
    VIBERACING_TEST_COLLECTOR_TRACE: trace,
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "25,150,100",
  });
  const first = spawn(
    process.execPath,
    [connectorPath, "hook", "--source", sources[0].clientSourceId, "--agent", sources[0].agentId],
    { env: environment, stdio: ["pipe", "pipe", "pipe"] },
  );
  const firstClose = once(first, "close");
  context.after(() => first.kill("SIGKILL"));
  let firstStdout = "";
  let firstStderr = "";
  first.stdout.setEncoding("utf8").on("data", (chunk) => (firstStdout += chunk));
  first.stderr.setEncoding("utf8").on("data", (chunk) => (firstStderr += chunk));
  first.stdin.end("{}\n");
  let schedulerPid;
  await waitFor(async () => {
    const value = await readFile(`${barrier}.ready`, "utf8").catch(() => "");
    const candidate = Number(value.trim());
    if (!Number.isSafeInteger(candidate) || candidate < 1) return false;
    schedulerPid = candidate;
    return true;
  });
  assert.ok(Number.isSafeInteger(schedulerPid) && schedulerPid > 0);

  const second = await runWithInput(
    ["hook", "--source", sources[1].clientSourceId, "--agent", sources[1].agentId],
    environment,
    "{}",
  );
  assert.equal(second.code, 0);
  assert.equal(second.stdout, "");
  assert.equal(second.stderr, "");
  const dirty = JSON.parse(await readFile(join(directory, "dirty.json"), "utf8"));
  assert.deepEqual(
    new Set(Object.keys(dirty.sources)),
    new Set(sources.slice(0, 2).map((source) => source.clientSourceId)),
  );

  await writeFile(`${barrier}.continue`, "continue\n");
  const [firstCode] = await firstClose;
  assert.equal(firstCode, 0);
  assert.equal(firstStdout, "");
  assert.equal(firstStderr, "");
  await waitFor(() => bodies.length === 1);
  assert.deepEqual(
    new Set((await readFile(trace, "utf8")).trim().split("\n")),
    new Set(sources.slice(0, 2).map((source) => source.clientSourceId)),
  );
  assert.deepEqual(
    new Set(bodies[0].snapshots.map((snapshot) => snapshot.sourceId)),
    new Set(sources.slice(0, 2).map((source) => source.sourceId)),
  );
  await waitFor(() => {
    try {
      process.kill(schedulerPid, 0);
      return false;
    } catch (error) {
      return error?.code === "ESRCH";
    }
  });
});

test("manual sync collects every active source and clears only its prior dirty generations", async (context) => {
  const bodies = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      bodies.push(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-manual-dirty-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  const date = new Date().toISOString().slice(0, 10);
  const sources = [0, 1].map((index) => ({
    clientSourceId: `${index + 7}0707070-7070-4070-8070-70707070707${index}`,
    sourceId: `${index + 8}0808080-8080-4080-8080-80808080808${index}`,
    agentId: "antigravity",
    dataPath: join(
      directory,
      "captures",
      `${index + 7}0707070-7070-4070-8070-70707070707${index}.jsonl`,
    ),
    collectionMethod: "antigravity_cli_capture",
    supportedSurface: "cli",
    suggestedLabel: `Antigravity ${index}`,
  }));
  await mkdir(join(directory, "captures"), { recursive: true });
  for (const [index, source] of sources.entries())
    await writeFile(
      source.dataPath,
      `${JSON.stringify({
        id: `manual-${index}`,
        date,
        usage: { date, totalTokens: `${index + 1}` },
      })}\n`,
    );
  await writeMappedInstallation(home, `http://127.0.0.1:${address.port}`, sources);
  await writeFile(
    join(directory, "dirty.json"),
    `${JSON.stringify({
      version: 2,
      sources: Object.fromEntries(
        sources.map((source, index) => [
          source.clientSourceId,
          {
            dirtySince: new Date().toISOString(),
            lastEventAt: new Date().toISOString(),
            generation: `90909090-9090-4090-8090-90909090909${index}`,
          },
        ]),
      ),
    })}\n`,
  );
  const trace = join(home, "manual-trace.txt");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_COLLECTOR_TRACE: trace,
  });
  await execFileAsync(process.execPath, [connectorPath, "sync"], { env: environment });
  assert.deepEqual(
    new Set((await readFile(trace, "utf8")).trim().split("\n")),
    new Set(sources.map((source) => source.clientSourceId)),
  );
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].snapshots.length, 2);
  await assert.rejects(access(join(directory, "dirty.json")));
  await assert.rejects(access(join(directory, "scheduler.lock")));

  await execFileAsync(process.execPath, [connectorPath, "sync"], { env: environment });
  assert.equal(bodies.length, 1);
  assert.equal((await readFile(trace, "utf8")).trim().split("\n").length, 4);
});

test("an event arriving during manual sync survives for the next targeted batch", async (context) => {
  const bodies = [];
  let firstRequestStarted;
  let releaseFirstResponse;
  const firstRequest = new Promise((resolve) => (firstRequestStarted = resolve));
  const firstResponseCanFinish = new Promise((resolve) => (releaseFirstResponse = resolve));
  context.after(() => releaseFirstResponse());
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      bodies.push(body);
      if (bodies.length === 1) firstRequestStarted();
      const finish = () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(usageResponse(body)));
      };
      if (bodies.length === 1) firstResponseCanFinish.then(finish);
      else finish();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-manual-event-race-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  const now = new Date().toISOString();
  await writeFile(
    join(installation.directory, "dirty.json"),
    `${JSON.stringify({
      version: 2,
      sources: {
        [installation.clientSourceId]: {
          dirtySince: now,
          lastEventAt: now,
          generation: "91919191-9191-4191-8191-919191919191",
        },
      },
    })}\n`,
  );
  const trace = join(home, "manual-race-trace.txt");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_COLLECTOR_TRACE: trace,
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "25,150,100",
  });
  const manual = execFileAsync(process.execPath, [connectorPath, "sync"], { env: environment });
  await firstRequest;
  const date = new Date().toISOString().slice(0, 10);
  await appendFile(
    installation.capture,
    `${JSON.stringify({
      id: "manual-race-second-event",
      date,
      usage: { date, totalTokens: "5", inputTokens: "2", outputTokens: "3" },
    })}\n`,
  );
  await runWithInput(
    ["hook", "--source", installation.clientSourceId, "--agent", "antigravity"],
    environment,
    "{}",
  );
  releaseFirstResponse();
  await manual;
  await waitFor(() => bodies.length === 2);
  assert.equal(bodies[1].snapshots[0].entries[0].totalTokens, "8");
  assert.deepEqual((await readFile(trace, "utf8")).trim().split("\n"), [
    installation.clientSourceId,
    installation.clientSourceId,
  ]);
  await waitFor(async () => {
    try {
      await access(join(installation.directory, "dirty.json"));
      return false;
    } catch {
      return true;
    }
  });
  await waitFor(async () => {
    try {
      await access(join(installation.directory, "scheduler.lock"));
      return false;
    } catch {
      return true;
    }
  });
});

test("automatic sync makes one bounded retry after its sync-lock wait expires", async (context) => {
  const bodies = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      bodies.push(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-deferred-lock-retry-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  const syncLock = join(installation.directory, "sync.lock");
  const trace = join(home, "automatic-sync-trace.txt");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "20,80,40",
    VIBERACING_TEST_AUTOMATIC_SYNC_LOCK_WAIT_MS: "80",
    VIBERACING_TEST_AUTOMATIC_SYNC_TRACE: trace,
  });
  const hookArguments = ["hook", "--source", installation.clientSourceId, "--agent", "antigravity"];

  await writeFile(syncLock, "synthetic-owner\n");
  await runWithInput(hookArguments, environment, "{}");
  await waitFor(
    async () => (await readFile(trace, "utf8").catch(() => "")) === "sync-lock-skipped\n",
  );
  await unlink(syncLock);
  await waitFor(() => bodies.length === 1);
  await waitFor(async () =>
    access(join(installation.directory, "scheduler.lock")).then(
      () => false,
      () => true,
    ),
  );
  await assert.rejects(access(join(installation.directory, "dirty.json")));

  await writeFile(syncLock, "synthetic-owner\n");
  await runWithInput(hookArguments, environment, "{}");
  await waitFor(async () => (await readFile(trace, "utf8")).trim().split("\n").length === 3);
  await waitFor(async () =>
    access(join(installation.directory, "scheduler.lock")).then(
      () => false,
      () => true,
    ),
  );
  await delay(250);
  assert.equal((await readFile(trace, "utf8")).trim().split("\n").length, 3);
  assert.equal(bodies.length, 1);
  await access(join(installation.directory, "dirty.json"));
  await unlink(syncLock);
});

test("requires an explicit safe label when adding a local data root", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-source-label-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const state = join(home, ".viberacing");
  const sensitivePath = join(home, "client-secret-repository");
  const environment = connectorEnvironment(home);
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [connectorPath, "source", "add", "--agent", "claude_code", "--data-dir", sensitivePath],
      { env: environment },
    ),
    (error) => {
      assert.match(error.stderr, /--name NAME/);
      return true;
    },
  );
  await assert.rejects(access(join(state, "sources.json")));
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        connectorPath,
        "source",
        "add",
        "--agent",
        "claude_code",
        "--name",
        "Work\u001b[2J",
        "--data-dir",
        sensitivePath,
      ],
      { env: environment },
    ),
    /safe label/,
  );
  await assert.rejects(access(join(state, "sources.json")));

  await execFileAsync(
    process.execPath,
    [
      connectorPath,
      "source",
      "add",
      "--agent",
      "claude_code",
      "--name",
      "Work",
      "--data-dir",
      sensitivePath,
    ],
    { env: environment },
  );
  const local = JSON.parse(await readFile(join(state, "sources.json"), "utf8"));
  assert.equal(local.sources[0].suggestedLabel, "Work");
  assert.match(local.sources[0].clientSourceId, /^[0-9a-f-]{36}$/);
  await execFileAsync(
    process.execPath,
    [
      connectorPath,
      "source",
      "add",
      "--agent",
      "kimi_code",
      "--name",
      "Archive",
      "--data-dir",
      join(home, "archived-kimi"),
      "--legacy",
    ],
    { env: environment },
  );
  const withLegacy = JSON.parse(await readFile(join(state, "sources.json"), "utf8"));
  assert.equal(withLegacy.sources[1].collectionMethod, "kimi_legacy_wire_jsonl");
  await assert.rejects(access(join(state, "config.json")));
});

test("connect pairs only exact sources and keeps every local path out of its payload", async (context) => {
  let pairingBody;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (request.url === "/api/pairing/cancel") {
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.url === "/api/pairing/poll") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "pending" }));
        return;
      }
      pairingBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          installationId: pairingBody.installationId,
          pollToken: "privacy_poll_token_that_is_long_enough_1234",
          verificationUrl: `http://${request.headers.host}/connect?code=ABCDEFGH`,
          code: "ABCDEFGH",
          expiresInSeconds: 1,
        }),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-pairing-privacy-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  await mkdir(directory, { recursive: true });
  await writeLocalSources(directory, [
    {
      clientSourceId: "11111111-2222-4333-8444-555555555555",
      agentId: "antigravity",
      dataPath: join(home, "private", "antigravity.jsonl"),
      executablePath: join(home, "private", "agy"),
      hookConfigRoot: join(home, "private", "qwen-config"),
      collectionMethod: "antigravity_cli_capture",
      supportedSurface: "cli",
      suggestedLabel: "Antigravity",
    },
  ]);

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [connectorPath, "connect", "--origin", `http://127.0.0.1:${address.port}`],
      {
        env: connectorEnvironment(home, {
          NODE_ENV: "test",
          PATH: "",
          VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
        }),
      },
    ),
    /Pairing expired/,
  );
  assert.equal(pairingBody.sources.length, 1);
  assert.deepEqual(Object.keys(pairingBody.sources[0]).sort(), [
    "agentId",
    "clientSourceId",
    "collectionMethod",
    "suggestedLabel",
    "supportedSurface",
  ]);
  assert.equal(pairingBody.sources[0].agentId, "antigravity");
  assert.doesNotMatch(JSON.stringify(pairingBody), new RegExp(home.replaceAll("\\", "\\\\")));
  for (const forbidden of [
    "dataPath",
    "canonicalPath",
    "executablePath",
    "hookConfigRoot",
    "prompt",
    "response",
    "model",
    "repository",
    "credentials",
  ])
    assert.equal(JSON.stringify(pairingBody).includes(forbidden), false);
});

test("connect replaces a legacy OpenCode filename label before pairing and local commit", async (context) => {
  let pairingBody;
  const sourceId = "53535353-5353-4353-8353-535353535353";
  const accountId = "54545454-5454-4454-8454-545454545454";
  const mapping = () => {
    const paired = pairingBody.sources[0];
    return {
      clientSourceId: paired.clientSourceId,
      sourceId,
      agentAccountId: accountId,
      agentId: "opencode",
      accountLabel: paired.suggestedLabel,
      collectionMethod: "opencode_sqlite",
      lastAcceptedSyncSequence: "0",
    };
  };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/pairing/start") {
        pairingBody = body;
        response.statusCode = 201;
        response.end(
          JSON.stringify({
            installationId: body.installationId,
            code: "ABCDEFGH",
            pollToken: "opencode_label_poll_token_that_is_long_enough",
            verificationUrl: `http://${request.headers.host}/connect?code=ABCDEFGH`,
            expiresInSeconds: 30,
          }),
        );
        return;
      }
      if (request.url === "/api/installations/current") {
        response.end(JSON.stringify(reconciliationResponse([mapping()])));
        return;
      }
      if (request.url === "/api/pairing/poll") {
        response.end(
          JSON.stringify({
            status: "active",
            deviceToken: "opencode_label_device_token_that_is_long_enough",
            protocol: {
              version: 2,
              snapshotDays: 31,
              maximumSources: 32,
              maximumEntries: 1_024,
            },
            sources: [mapping()],
          }),
        );
        return;
      }
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-opencode-label-connect-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const directory = join(home, ".viberacing");
  const dataRoot = join(home, ".local", "share", "opencode");
  const databasePath = join(dataRoot, "opencode-custom-channel.db");
  await mkdir(dataRoot, { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("CREATE TABLE message (id TEXT, time_created INTEGER, data TEXT)");
  database.close();
  await mkdir(directory, { recursive: true });
  await writeLocalSources(directory, [
    {
      clientSourceId: "55555555-5555-4555-8555-555555555555",
      agentId: "opencode",
      dataPath: databasePath,
      collectionMethod: "opencode_sqlite",
      supportedSurface: "cli",
      suggestedLabel: "OpenCode custom-channel",
    },
  ]);

  await execFileAsync(
    process.execPath,
    [connectorPath, "connect", "--origin", `http://127.0.0.1:${address.port}`],
    {
      env: connectorEnvironment(home, {
        NODE_ENV: "test",
        PATH: "",
        VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
      }),
    },
  );

  assert.equal(pairingBody.sources[0].suggestedLabel, "OpenCode");
  assert.equal(JSON.stringify(pairingBody).includes("custom-channel"), false);
  assert.equal((await readLocalSources(directory))[0].suggestedLabel, "OpenCode");
  const config = JSON.parse(await readFile(join(directory, "config.json"), "utf8"));
  assert.equal(JSON.stringify(config).includes("custom-channel"), false);
});

test("later disconnect defeats pending, active-polled, and interrupted connect attempts", async (context) => {
  const installationId = "19191919-1919-4191-8191-191919191919";
  const clientSourceId = "20202020-2020-4202-8202-202020202020";
  const sourceId = "21212121-2121-4212-8212-212121212121";
  const mapping = {
    clientSourceId,
    sourceId,
    agentAccountId: "22222222-2222-4222-8222-222222222222",
    agentId: "antigravity",
    accountLabel: "Antigravity",
    collectionMethod: "antigravity_cli_capture",
    lastAcceptedSyncSequence: "0",
  };
  let serverState = "pending";
  let nextPairingState = "pending";
  let cancellations = 0;
  let deletes = 0;
  let deleteFailure = false;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      if (request.url === "/api/installations/current" && request.method === "POST") {
        const status = serverState === "revoked" ? 401 : 200;
        response.writeHead(status, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            status === 401 ? { error: "unauthorized" } : reconciliationResponse([mapping]),
          ),
        );
        return;
      }
      if (request.url === "/api/installations/current" && request.method === "DELETE") {
        deletes += 1;
        const status = deleteFailure ? 503 : serverState === "revoked" ? 401 : 204;
        if (!deleteFailure) serverState = "revoked";
        response.writeHead(status, status === 204 ? {} : { "content-type": "application/json" });
        response.end(
          status === 204
            ? undefined
            : JSON.stringify({ error: status === 401 ? "unauthorized" : "server_error" }),
        );
        return;
      }
      if (request.url === "/api/pairing/start") {
        serverState = nextPairingState;
        response.writeHead(201, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            installationId,
            code: "RACETEST",
            pollToken: "race_poll_token_that_is_long_enough_123456",
            verificationUrl: `http://${request.headers.host}/connect?code=RACETEST`,
            expiresInSeconds: 30,
          }),
        );
        return;
      }
      if (request.url === "/api/pairing/cancel") {
        cancellations += 1;
        serverState = "revoked";
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.url === "/api/pairing/poll") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            serverState === "active"
              ? {
                  status: "active",
                  deviceToken: "race_replacement_device_token_that_is_long_enough",
                  sources: [mapping],
                  protocol: {
                    version: 2,
                    snapshotDays: 31,
                    maximumSources: 32,
                    maximumEntries: 1_024,
                  },
                }
              : { status: serverState },
          ),
        );
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const home = await mkdtemp(join(tmpdir(), "viberacing-connect-disconnect-race-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const directory = join(home, ".viberacing");
  const capture = join(directory, "captures", `${clientSourceId}.jsonl`);
  await mkdir(join(directory, "captures"), { recursive: true });
  await writeFile(capture, "");
  const localSource = {
    clientSourceId,
    agentId: "antigravity",
    dataPath: capture,
    collectionMethod: "antigravity_cli_capture",
    supportedSurface: "cli",
    suggestedLabel: "Antigravity",
  };
  await writeLocalSources(directory, [localSource]);
  const writeInstallationIdentity = () =>
    writeFile(
      join(directory, "installation.json"),
      `${JSON.stringify({
        version: 1,
        id: installationId,
        secret: "race_installation_secret_that_is_long_enough",
      })}\n`,
    );
  await writeInstallationIdentity();
  const baseEnvironment = connectorEnvironment(home, {
    NODE_ENV: "test",
    PATH: "",
    VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
  });
  const spawnConnect = (extra = {}) => {
    const child = spawn(process.execPath, [connectorPath, "connect", "--origin", origin], {
      env: { ...baseEnvironment, ...extra },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    return {
      child,
      result: once(child, "close").then(([code, signal]) => ({ code, signal, stderr })),
    };
  };
  const runBarrierRace = async (stage, lifecycleArguments = ["disconnect"]) => {
    const barrier = join(home, `connect-${stage}-${randomUUID()}`);
    const connect = spawnConnect({
      VIBERACING_TEST_CONNECT_PAUSE: stage,
      VIBERACING_TEST_CONNECT_BARRIER: barrier,
    });
    await waitFor(() =>
      access(`${barrier}.ready`)
        .then(() => true)
        .catch(() => false),
    );
    await execFileAsync(process.execPath, [connectorPath, ...lifecycleArguments], {
      env: baseEnvironment,
    });
    await writeFile(`${barrier}.continue`, "continue\n");
    return connect.result;
  };

  const pendingResult = await runBarrierRace("after_pairing_start");
  assert.equal(pendingResult.code, 1);
  assert.match(pendingResult.stderr, /Pairing was revoked/);
  await assert.rejects(access(join(directory, "config.json")));
  await assert.rejects(access(join(directory, "connect-attempt.json")));

  const resetResult = await runBarrierRace("after_pairing_start", ["reset-installation"]);
  assert.equal(resetResult.code, 1);
  await assert.rejects(access(join(directory, "installation.json")));
  await assert.rejects(access(join(directory, "config.json")));
  await writeInstallationIdentity();

  const addedPath = join(home, "added-claude");
  const addResult = await runBarrierRace("after_pairing_start", [
    "source",
    "add",
    "--agent",
    "claude_code",
    "--name",
    "Added during pairing",
    "--data-dir",
    addedPath,
  ]);
  assert.equal(addResult.code, 1);
  const addedSource = (await readLocalSources(directory)).find(
    (source) => source.dataPath === addedPath,
  );
  assert.ok(addedSource);
  await assert.rejects(access(join(directory, "config.json")));

  const removeResult = await runBarrierRace("after_pairing_start", [
    "source",
    "remove",
    addedSource.clientSourceId,
  ]);
  assert.equal(removeResult.code, 1);
  assert.equal(
    (await readLocalSources(directory)).some(
      (source) => source.clientSourceId === addedSource.clientSourceId,
    ),
    false,
  );
  await assert.rejects(access(join(directory, "config.json")));

  const writePreviousConnection = async () => {
    await writeLocalSources(directory, [localSource]);
    await writeFile(
      join(directory, "config.json"),
      `${JSON.stringify({
        version: 2,
        origin,
        installationId,
        deviceToken: "race_previous_device_token_that_is_long_enough",
        sources: [mapping],
        protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
      })}\n`,
    );
  };
  await writePreviousConnection();
  serverState = "active";
  nextPairingState = "active";
  const activeResult = await runBarrierRace("after_active_poll");
  assert.equal(activeResult.code, 1);
  assert.match(activeResult.stderr, /superseded by a local lifecycle change/);
  await assert.rejects(access(join(directory, "config.json")));
  await assert.rejects(access(join(directory, "connection-commit.json")));
  await assert.rejects(access(join(directory, "connect-attempt.json")));

  await writePreviousConnection();
  serverState = "active";
  nextPairingState = "active";
  const interruptionBarrier = join(home, `connect-interruption-${randomUUID()}`);
  const interrupted = spawnConnect({
    VIBERACING_TEST_CONNECT_PAUSE: "after_active_poll",
    VIBERACING_TEST_CONNECT_BARRIER: interruptionBarrier,
  });
  await waitFor(() =>
    access(`${interruptionBarrier}.ready`)
      .then(() => true)
      .catch(() => false),
  );
  assert.equal(interrupted.child.kill("SIGKILL"), true);
  const interruptedResult = await interrupted.result;
  assert.ok(interruptedResult.signal !== null || interruptedResult.code !== 0);
  await access(join(directory, "connect-attempt.json"));
  nextPairingState = "pending";
  const restartedResult = await runBarrierRace("after_pairing_start");
  assert.equal(restartedResult.code, 1);
  await assert.rejects(access(join(directory, "config.json")));
  await assert.rejects(access(join(directory, "connect-attempt.json")));
  await assert.rejects(access(join(directory, "dirty.json")));
  assert.ok(cancellations >= 6);
  assert.ok(deletes >= 1);

  await writePreviousConnection();
  await writeFile(
    join(directory, "connect-attempt.json"),
    `${JSON.stringify({
      version: 1,
      attemptId: randomUUID(),
      installationId,
      sourceRegistryRevision: randomUUID(),
      origin,
      startedAt: new Date().toISOString(),
      pollToken: "race_poll_token_that_is_long_enough_123456",
    })}\n`,
  );
  serverState = "active";
  deleteFailure = true;
  const uncertainDisconnect = await execFileAsync(process.execPath, [connectorPath, "disconnect"], {
    env: baseEnvironment,
  });
  assert.match(uncertainDisconnect.stderr, /remote revoke could not be confirmed/);
});

test("reconnect rejects omission and retains a temporarily unavailable source", async (context) => {
  let pairingBody;
  let omitRetained = true;
  const installationId = "67676767-6767-4767-8767-676767676767";
  const activeClientSourceId = "68686868-6868-4868-8868-686868686868";
  const retainedClientSourceId = "69696969-6969-4969-8969-696969696969";
  const activeSourceId = "70707070-7070-4070-8070-707070707070";
  const retainedSourceId = "71717171-7171-4171-8171-717171717171";
  const mappings = [
    {
      clientSourceId: activeClientSourceId,
      sourceId: activeSourceId,
      agentAccountId: "72727272-7272-4272-8272-727272727272",
      agentId: "antigravity",
      accountLabel: "Active",
      collectionMethod: "antigravity_cli_capture",
      lastAcceptedSyncSequence: "0",
    },
    {
      clientSourceId: retainedClientSourceId,
      sourceId: retainedSourceId,
      agentAccountId: "73737373-7373-4373-8373-737373737373",
      agentId: "claude_code",
      accountLabel: "Retained",
      collectionMethod: "claude_jsonl",
      lastAcceptedSyncSequence: "0",
    },
  ];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(request.url === "/api/pairing/start" ? 201 : 200, {
        "content-type": "application/json",
      });
      if (request.url === "/api/installations/current") {
        response.end(JSON.stringify(reconciliationResponse(mappings)));
        return;
      }
      if (request.url === "/api/pairing/start") {
        pairingBody = body;
        response.end(
          JSON.stringify({
            installationId,
            code: "ABCDEFGH",
            pollToken: "retained_poll_token_that_is_long_enough_1234",
            verificationUrl: `http://${request.headers.host}/connect?code=ABCDEFGH`,
            expiresInSeconds: 30,
          }),
        );
        return;
      }
      if (request.url === "/api/pairing/poll") {
        response.end(
          JSON.stringify({
            status: "active",
            deviceToken: "retained_device_token_that_is_long_enough_12",
            protocol: {
              version: 2,
              snapshotDays: 31,
              maximumSources: 32,
              maximumEntries: 1_024,
            },
            sources: omitRetained ? mappings.slice(0, 1) : mappings,
          }),
        );
        return;
      }
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const home = await mkdtemp(join(tmpdir(), "viberacing-retained-reconnect-"));
  context.after(() => rm(home, { recursive: true }));
  const directory = join(home, ".viberacing");
  const capture = join(directory, "captures", `${activeClientSourceId}.jsonl`);
  await mkdir(join(directory, "captures"), { recursive: true });
  await writeFile(capture, "");
  const sources = [
    {
      clientSourceId: activeClientSourceId,
      agentId: "antigravity",
      dataPath: capture,
      collectionMethod: "antigravity_cli_capture",
      supportedSurface: "cli",
      suggestedLabel: "Active",
    },
    {
      clientSourceId: retainedClientSourceId,
      agentId: "claude_code",
      dataPath: join(home, ".claude", "projects"),
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Retained",
    },
  ];
  await writeLocalSources(directory, sources);
  await writeFile(
    join(directory, "installation.json"),
    `${JSON.stringify({
      version: 1,
      id: installationId,
      secret: "retained_installation_secret_that_is_long_enough",
    })}\n`,
  );
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin,
      installationId,
      deviceToken: "previous_device_token_that_is_long_enough_12",
      sources: mappings,
      protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
    })}\n`,
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [activeSourceId]: "0", [retainedSourceId]: "0" },
    })}\n`,
  );
  await mkdir(join(home, ".claude"), { recursive: true });
  const hookPath = join(home, ".claude", "settings.json");
  await writeFile(hookPath, '{"hooks":{"Stop":[{"hooks":[{"command":"keep-me"}]}]}}\n');
  const configBefore = await readFile(join(directory, "config.json"));
  const sourcesBefore = await readFile(join(directory, "sources.json"));
  const hookBefore = await readFile(hookPath);
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    PATH: "",
    VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
  });

  await assert.rejects(
    execFileAsync(process.execPath, [connectorPath, "connect", "--origin", origin], {
      env: environment,
    }),
    /invalid protocol response/,
  );
  assert.deepEqual(await readFile(join(directory, "config.json")), configBefore);
  assert.deepEqual(await readFile(join(directory, "sources.json")), sourcesBefore);
  assert.deepEqual(await readFile(hookPath), hookBefore);

  omitRetained = false;
  await assert.rejects(
    execFileAsync(process.execPath, [connectorPath, "connect", "--origin", origin], {
      env: { ...environment, VIBERACING_TEST_FAIL_CONNECTION_CONFIG_COMMIT: "1" },
    }),
    /Synthetic connection config commit failure/,
  );
  assert.deepEqual(await readFile(join(directory, "config.json")), configBefore);
  assert.deepEqual(await readFile(join(directory, "sources.json")), sourcesBefore);
  assert.deepEqual(await readFile(hookPath), hookBefore);

  let interruption;
  try {
    await execFileAsync(process.execPath, [connectorPath, "connect", "--origin", origin], {
      env: { ...environment, VIBERACING_TEST_INTERRUPT_AFTER_CONNECTION_COMMIT: "1" },
    });
  } catch (error) {
    interruption = error;
  }
  assert.ok(Number.isInteger(interruption?.code) && interruption.code !== 0);
  assert.equal(
    JSON.parse(await readFile(join(directory, "config.json"), "utf8")).deviceToken,
    "retained_device_token_that_is_long_enough_12",
  );
  await access(join(directory, "connection-commit.json"));
  assert.deepEqual(await readFile(hookPath), hookBefore);
  await execFileAsync(process.execPath, [connectorPath, "doctor", "--repair"], {
    env: environment,
  });
  await assert.rejects(access(join(directory, "connection-commit.json")));
  assert.match(await readFile(hookPath, "utf8"), /viberacing-hook-v3/);

  await writeFile(hookPath, "{invalid-json");
  const connectedResult = await execFileAsync(
    process.execPath,
    [connectorPath, "connect", "--origin", origin],
    { env: environment },
  );
  assert.match(connectedResult.stderr, /hook: Cannot read hook settings/);
  assert.equal(await readFile(hookPath, "utf8"), "{invalid-json");
  assert.deepEqual(
    pairingBody.sources.map((source) => source.clientSourceId),
    [activeClientSourceId],
  );
  const connected = JSON.parse(await readFile(join(directory, "config.json"), "utf8"));
  assert.equal(connected.deviceToken, "retained_device_token_that_is_long_enough_12");
  assert.deepEqual(
    connected.sources.map((source) => source.sourceId).sort(),
    [activeSourceId, retainedSourceId].sort(),
  );

  await writeFile(hookPath, '{"hooks":{"Stop":[{"hooks":[{"command":"keep-me"}]}]}}\n');
  await execFileAsync(process.execPath, [connectorPath, "doctor", "--repair"], {
    env: environment,
  });
  assert.match(await readFile(hookPath, "utf8"), /viberacing-hook-v3/);
});


test("hostile pairing response cannot change config, hooks, or local paths", async (context) => {
  let localSource;
  const maliciousRoot = join(tmpdir(), `viberacing-malicious-${process.pid}`);
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      if (request.url === "/api/pairing/start") {
        response.end(
          JSON.stringify({
            installationId: body.installationId,
            code: "ABCDEFGH",
            pollToken: "hostile_poll_token_that_is_long_enough_1234",
            verificationUrl: `http://${request.headers.host}/connect?code=ABCDEFGH`,
            expiresInSeconds: 30,
          }),
        );
        return;
      }
      response.end(
        JSON.stringify({
          status: "active",
          deviceToken: "hostile_device_token_that_is_long_enough_12",
          protocol: {
            version: 2,
            snapshotDays: 31,
            maximumSources: 32,
            maximumEntries: 1_024,
          },
          sources: [
            {
              clientSourceId: localSource.clientSourceId,
              sourceId: localSource.sourceId,
              agentAccountId: "56565656-5656-4656-8656-565656565656",
              agentId: "antigravity",
              accountLabel: "Hostile",
              collectionMethod: "antigravity_cli_capture",
              lastAcceptedSyncSequence: "0",
              hookConfigRoot: maliciousRoot,
            },
          ],
        }),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  context.after(() => rm(maliciousRoot, { force: true, recursive: true }));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-hostile-pairing-"));
  context.after(() => rm(home, { recursive: true }));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  localSource = installation;
  await writeFile(
    join(installation.directory, "installation.json"),
    `${JSON.stringify({
      version: 1,
      id: "57575757-5757-4757-8757-575757575757",
      secret: "local_installation_secret_that_is_long_enough",
    })}\n`,
  );
  const hookPath = join(home, ".claude", "settings.json");
  await mkdir(join(home, ".claude"), { recursive: true });
  await writeFile(hookPath, '{"hooks":{"Stop":[{"hooks":[{"command":"keep-me"}]}]}}\n');
  const configBefore = await readFile(join(installation.directory, "config.json"));
  const sourcesBefore = await readFile(join(installation.directory, "sources.json"));
  const hookBefore = await readFile(hookPath);

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [connectorPath, "connect", "--origin", `http://127.0.0.1:${address.port}`],
      {
        env: connectorEnvironment(home, {
          NODE_ENV: "test",
          PATH: "",
          VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
        }),
      },
    ),
    /invalid protocol response/,
  );
  assert.deepEqual(await readFile(join(installation.directory, "config.json")), configBefore);
  assert.deepEqual(await readFile(join(installation.directory, "sources.json")), sourcesBefore);
  assert.deepEqual(await readFile(hookPath), hookBefore);
  await assert.rejects(access(maliciousRoot));
});

test("removes a source online with all local state and remains idempotent", async (context) => {
  const server = createServer((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-source-remove-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  const pending = join(directory, "pending");
  await mkdir(pending, { recursive: true });
  const sourceId = "33333333-3333-4333-8333-333333333333";
  const clientSourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin: `http://127.0.0.1:${address.port}`,
      deviceToken: "synthetic-device-token",
      sources: [
        {
          clientSourceId,
          sourceId,
          agentId: "claude_code",
          accountLabel: "Work",
          dataPath: join(home, "claude"),
          collectionMethod: "claude_jsonl",
          supportedSurface: "cli",
          suggestedLabel: "Work",
        },
      ],
    })}\n`,
  );
  await writeLocalSources(directory, [
    {
      clientSourceId,
      agentId: "claude_code",
      dataPath: join(home, "claude"),
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Work",
    },
  ]);
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [sourceId]: "4" },
      adapters: { [sourceId]: { qwen: 1 } },
      fingerprints: { [sourceId]: "fingerprint" },
      quarantine: { [sourceId]: "invalid_payload" },
    })}\n`,
  );
  await writeFile(
    join(pending, `${sourceId}.json`),
    `${JSON.stringify({
      protocolVersion: 2,
      snapshots: [{ sourceId, syncSequence: "4", entries: [] }],
      sourceErrors: [],
    })}\n`,
  );
  await mkdir(join(pending, "quarantine"));
  await writeFile(join(pending, "quarantine", `${sourceId}.json`), "{}\n");
  await writeFile(
    join(directory, "dirty.json"),
    `${JSON.stringify({
      version: 2,
      sources: {
        [clientSourceId]: {
          dirtySince: new Date().toISOString(),
          lastEventAt: new Date().toISOString(),
          generation: "81818181-8181-4181-8181-818181818181",
        },
      },
    })}\n`,
  );
  await mkdir(join(home, "claude"), { recursive: true });
  await writeFile(
    join(home, "claude", "settings.json"),
    JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: "keep-foreign" }] },
          {
            hooks: [
              {
                type: "command",
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${clientSourceId}`,
              },
            ],
          },
        ],
      },
    }),
  );

  await execFileAsync(process.execPath, [connectorPath, "source", "remove", clientSourceId], {
    env: connectorEnvironment(home),
  });
  const config = JSON.parse(await readFile(join(directory, "config.json"), "utf8"));
  const localState = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
  assert.deepEqual(config.sources, []);
  assert.equal(localState.sequences[sourceId], undefined);
  assert.equal(localState.adapters[sourceId], undefined);
  assert.equal(localState.fingerprints[sourceId], undefined);
  assert.equal(localState.quarantine[sourceId], undefined);
  await assert.rejects(access(join(pending, `${sourceId}.json`)));
  await assert.rejects(access(join(pending, "quarantine", `${sourceId}.json`)));
  await assert.rejects(access(join(directory, "dirty.json")));
  const hookSettings = await readFile(join(home, "claude", "settings.json"), "utf8");
  assert.doesNotMatch(hookSettings, /viberacing-hook-v3/);
  assert.match(hookSettings, /keep-foreign/);
  const repeated = await execFileAsync(
    process.execPath,
    [connectorPath, "source", "remove", clientSourceId],
    { env: connectorEnvironment(home) },
  );
  assert.match(repeated.stdout, /already absent/i);
});

test("source removal is offline-safe and stops its local hook", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-source-remove-offline-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const clientSourceId = "82828282-8282-4282-8282-828282828282";
  const sourceId = "83838383-8383-4383-8383-838383838383";
  const root = join(home, "qwen-custom");
  const local = {
    clientSourceId,
    agentId: "qwen_code",
    dataPath: root,
    hookConfigRoot: root,
    collectionMethod: "qwen_stats_jsonl",
    supportedSurface: "cli",
    suggestedLabel: "Offline",
  };
  const directory = await writeMappedInstallation(home, "http://127.0.0.1:1", [
    { ...local, sourceId },
  ]);
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "settings.json"),
    JSON.stringify({
      hooks: {
        SessionEnd: [
          {
            hooks: [
              {
                type: "command",
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${clientSourceId}`,
              },
            ],
          },
        ],
      },
    }),
  );
  const result = await execFileAsync(
    process.execPath,
    [connectorPath, "source", "remove", clientSourceId],
    { env: connectorEnvironment(home) },
  );
  assert.match(result.stderr, /remote source disconnect could not be confirmed/i);
  assert.doesNotMatch(await readFile(join(root, "settings.json"), "utf8"), /viberacing-hook/);
  assert.deepEqual(await readLocalSources(directory), []);
  assert.deepEqual(JSON.parse(await readFile(join(directory, "config.json"), "utf8")).sources, []);
});

test("source removal keeps custom-root metadata when hook cleanup fails", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-source-remove-hook-failure-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const clientSourceId = "84848484-8484-4484-8484-848484848484";
  const root = join(home, "claude-invalid");
  const local = {
    clientSourceId,
    agentId: "claude_code",
    dataPath: root,
    collectionMethod: "claude_jsonl",
    supportedSurface: "cli",
    suggestedLabel: "Retry cleanup",
  };
  const directory = join(home, ".viberacing");
  await mkdir(root, { recursive: true });
  await mkdir(directory, { recursive: true });
  await writeLocalSources(directory, [local]);
  await writeFile(join(root, "settings.json"), "{invalid-json");
  await assert.rejects(
    execFileAsync(process.execPath, [connectorPath, "source", "remove", clientSourceId], {
      env: connectorEnvironment(home),
    }),
    /metadata was kept for retry/,
  );
  assert.equal((await readLocalSources(directory))[0].clientSourceId, clientSourceId);
  assert.equal(await readFile(join(root, "settings.json"), "utf8"), "{invalid-json");
});

test("quarantines a server-disconnected pending source without poisoning future syncs", async (context) => {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/api/installations/current") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(reconciliationResponse([{ sourceId }])));
      return;
    }
    requests += 1;
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "unsupported_source" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-pending-retire-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  const pending = join(directory, "pending");
  await mkdir(pending, { recursive: true });
  const sourceId = "44444444-4444-4444-8444-444444444444";
  const clientSourceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin: `http://127.0.0.1:${address.port}`,
      deviceToken: "synthetic-device-token",
      sources: [
        {
          clientSourceId,
          sourceId,
          agentId: "claude_code",
          accountLabel: "Retired",
          dataPath: join(home, "claude"),
          collectionMethod: "claude_jsonl",
          supportedSurface: "cli",
          suggestedLabel: "Retired",
        },
      ],
    })}\n`,
  );
  await writeLocalSources(directory, [
    {
      clientSourceId,
      agentId: "claude_code",
      dataPath: join(home, "claude"),
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Retired",
    },
  ]);
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({ version: 1, sequences: { [sourceId]: "1" } })}\n`,
  );
  await writeFile(
    join(pending, `${sourceId}.json`),
    `${JSON.stringify({
      protocolVersion: 2,
      snapshots: [{ sourceId, syncSequence: "1", entries: [] }],
      sourceErrors: [],
    })}\n`,
  );
  await mkdir(join(home, "claude"), { recursive: true });
  await writeFile(
    join(home, "claude", "settings.json"),
    JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${clientSourceId}`,
              },
            ],
          },
        ],
      },
    }),
  );
  await writeFile(
    join(directory, "dirty.json"),
    `${JSON.stringify({
      version: 2,
      sources: {
        [clientSourceId]: {
          dirtySince: new Date().toISOString(),
          lastEventAt: new Date().toISOString(),
          generation: "85858585-8585-4585-8585-858585858585",
        },
      },
    })}\n`,
  );

  await execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: connectorEnvironment(home),
  });
  assert.equal(requests, 1);
  assert.deepEqual(JSON.parse(await readFile(join(directory, "config.json"), "utf8")).sources, []);
  assert.deepEqual(await import("node:fs/promises").then(({ readdir }) => readdir(pending)), []);
  assert.equal((await readLocalSources(directory))[0].clientSourceId, clientSourceId);
  assert.doesNotMatch(
    await readFile(join(home, "claude", "settings.json"), "utf8"),
    /viberacing-hook/,
  );
  await assert.rejects(access(join(directory, "dirty.json")));
  await runWithInput(
    ["hook", "--source", clientSourceId, "--agent", "claude_code"],
    connectorEnvironment(home),
    "{}",
  );
  await assert.rejects(access(join(directory, "scheduler.lock")));
  await assert.rejects(access(join(directory, "dirty.json")));
});

test("doctor reports Claude availability without collecting usage", async (context) => {
  const sourceId = "55555555-5555-4555-8555-555555555555";
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: "active",
        lastSyncAt: null,
        sources: [{ sourceId, status: "active", lastAcceptedSyncSequence: "0" }],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-doctor-claude-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  const clientSourceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin: `http://127.0.0.1:${address.port}`,
      deviceToken: "synthetic-device-token",
      sources: [
        {
          clientSourceId,
          sourceId,
          agentId: "claude_code",
          accountLabel: "Work",
          dataPath: fileURLToPath(new URL("fixtures", import.meta.url)),
          collectionMethod: "claude_jsonl",
          supportedSurface: "cli",
          suggestedLabel: "Work",
        },
      ],
    })}\n`,
  );
  await writeLocalSources(directory, [
    {
      clientSourceId,
      agentId: "claude_code",
      dataPath: fileURLToPath(new URL("fixtures", import.meta.url)),
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Work",
    },
  ]);
  const result = await execFileAsync(process.execPath, [connectorPath, "doctor"], {
    env: connectorEnvironment(home, { PATH: "" }),
  });
  assert.match(result.stdout, /claude_code diagnostics: ok/);
  assert.doesNotMatch(result.stdout, /claude_code \(Work\): ok/);
});

test("doctor explains Qwen relative settings and Antigravity wrapper-only", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-doctor-discovery-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  await mkdir(join(home, ".qwen"), { recursive: true });
  await writeFile(
    join(home, ".qwen", "settings.json"),
    JSON.stringify({ advanced: { runtimeOutputDir: "project-runtime" } }),
  );
  const result = await execFileAsync(process.execPath, [connectorPath, "doctor"], {
    env: connectorEnvironment(home, { PATH: "" }),
  });
  assert.match(result.stdout, /Qwen Code:[\s\S]*runtimeOutputDir is relative/);
  assert.match(result.stdout, /viberacing source add --agent qwen_code/);
  assert.match(result.stdout, /Antigravity CLI:[\s\S]*Status: wrapper-only/);
  assert.match(
    result.stdout,
    /only Antigravity CLI sessions launched through the Vibe Racing wrapper are counted/,
  );
});

test("doctor serializes remote reconciliation behind an active sync", async (context) => {
  let releaseUpload;
  let uploadStarted;
  const firstUpload = new Promise((resolve) => (uploadStarted = resolve));
  const uploadCanFinish = new Promise((resolve) => (releaseUpload = resolve));
  context.after(() => releaseUpload());
  let currentRequests = 0;
  let installation;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (request.method === "POST" && request.url === "/api/installations/current") {
        currentRequests += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            reconciliationResponse([
              {
                sourceId: installation.sourceId,
                agentId: "antigravity",
                collectionMethod: "antigravity_cli_capture",
                status: "active",
                lastAcceptedSyncSequence: "1",
              },
            ]),
          ),
        );
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      uploadStarted();
      uploadCanFinish.then(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(usageResponse(body)));
      });
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-doctor-sync-lock-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  const environment = connectorEnvironment(home, { NODE_ENV: "test" });
  const activeSync = execFileAsync(process.execPath, [connectorPath, "sync"], { env: environment });
  await firstUpload;

  const doctor = spawn(process.execPath, [connectorPath, "doctor"], {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let doctorOutput = "";
  doctor.stdout.setEncoding("utf8").on("data", (chunk) => (doctorOutput += chunk));
  await waitFor(() => doctorOutput.includes("Connected origin:"));
  await delay(100);
  assert.equal(currentRequests, 0);

  releaseUpload();
  await activeSync;
  const [doctorCode] = await once(doctor, "close");
  assert.equal(doctorCode, 0);
  assert.equal(currentRequests, 1);
  assert.match(doctorOutput, /Pairing status: active/);
});

test("doctor repair re-enables automatic sync after a connector upgrade", async (context) => {
  let usageRequests = 0;
  let installation;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (request.method === "POST" && request.url === "/api/installations/current") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            reconciliationResponse([
              {
                sourceId: installation.sourceId,
                agentId: "antigravity",
                collectionMethod: "antigravity_cli_capture",
                status: "active",
                lastAcceptedSyncSequence: "0",
              },
            ]),
          ),
        );
        return;
      }
      usageRequests += 1;
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-doctor-upgrade-repair-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  await writeFile(
    join(installation.directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [installation.sourceId]: "0" },
      automaticDisabledReason: "unsupported_connector",
    })}\n`,
  );
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "20,80,40",
  });

  await execFileAsync(process.execPath, [connectorPath, "doctor", "--repair"], {
    env: environment,
  });
  assert.equal(
    JSON.parse(await readFile(join(installation.directory, "state.json"), "utf8"))
      .automaticDisabledReason,
    undefined,
  );
  await runWithInput(
    ["hook", "--source", installation.clientSourceId, "--agent", "antigravity"],
    environment,
    "{}",
  );
  await waitFor(() => usageRequests === 1);
  await waitFor(async () =>
    access(join(installation.directory, "scheduler.lock")).then(
      () => false,
      () => true,
    ),
  );
});

test("doctor disables a revoked installation and recommends reconnecting", async (context) => {
  const server = createServer((_request, response) => {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "unauthorized" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-doctor-revoked-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  await writeFile(
    join(installation.directory, "dirty.json"),
    `${JSON.stringify({ dirtySince: new Date().toISOString(), lastEventAt: new Date().toISOString() })}\n`,
  );

  const result = await execFileAsync(process.execPath, [connectorPath, "doctor"], {
    env: connectorEnvironment(home),
  });

  assert.match(result.stdout, /authorization was revoked/i);
  assert.match(result.stdout, /viberacing connect/i);
  await assert.rejects(access(join(installation.directory, "config.json")));
  await assert.rejects(access(join(installation.directory, "dirty.json")));
});

test("doctor removes a hook after dashboard-side source disconnect", async (context) => {
  const sourceId = "86868686-8686-4686-8686-868686868686";
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify(
        reconciliationResponse([
          {
            sourceId,
            agentId: "qwen_code",
            collectionMethod: "qwen_stats_jsonl",
            accountLabel: "Dashboard",
            status: "disconnected",
          },
        ]),
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-dashboard-disconnect-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const clientSourceId = "87878787-8787-4787-8787-878787878787";
  const root = join(home, "qwen-dashboard");
  const local = {
    clientSourceId,
    sourceId,
    agentId: "qwen_code",
    dataPath: root,
    hookConfigRoot: root,
    collectionMethod: "qwen_stats_jsonl",
    supportedSurface: "cli",
    suggestedLabel: "Dashboard",
  };
  const directory = await writeMappedInstallation(home, `http://127.0.0.1:${address.port}`, [
    local,
  ]);
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "settings.json"),
    JSON.stringify({
      hooks: {
        SessionEnd: [
          {
            hooks: [
              {
                type: "command",
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${clientSourceId}`,
              },
            ],
          },
        ],
      },
    }),
  );
  await execFileAsync(process.execPath, [connectorPath, "doctor"], {
    env: connectorEnvironment(home),
  });
  assert.deepEqual(JSON.parse(await readFile(join(directory, "config.json"), "utf8")).sources, []);
  assert.equal((await readLocalSources(directory))[0].clientSourceId, clientSourceId);
  assert.doesNotMatch(await readFile(join(root, "settings.json"), "utf8"), /viberacing-hook/);
});

test("automatic sync reconciles a dashboard disconnect before unchanged collection", async (context) => {
  let currentRequests = 0;
  let usageRequests = 0;
  const sourceId = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      if (request.method === "POST" && request.url === "/api/installations/current") {
        currentRequests += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            reconciliationResponse([
              {
                sourceId,
                agentId: "claude_code",
                collectionMethod: "claude_jsonl",
                accountLabel: "Dashboard",
                status: "disconnected",
              },
            ]),
          ),
        );
        return;
      }
      usageRequests += 1;
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unexpected_usage" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-auto-dashboard-disconnect-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const clientSourceId = "a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2";
  const root = join(home, "claude-dashboard");
  const source = {
    clientSourceId,
    sourceId,
    agentId: "claude_code",
    dataPath: root,
    collectionMethod: "claude_jsonl",
    supportedSurface: "cli",
    suggestedLabel: "Dashboard",
  };
  const directory = await writeMappedInstallation(home, `http://127.0.0.1:${address.port}`, [
    source,
  ]);
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [sourceId]: "0" },
      adapters: { [sourceId]: { offset: 12 } },
      fingerprints: { [sourceId]: "synthetic-fingerprint" },
      lastRemoteReconciliationAt: 0,
    })}\n`,
  );
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "settings.json"),
    JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${clientSourceId}`,
              },
            ],
          },
        ],
      },
    }),
  );
  const trace = join(home, "collector-trace.txt");
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    VIBERACING_TEST_COLLECTOR_TRACE: trace,
    VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "20,80,40",
    VIBERACING_TEST_REMOTE_RECONCILIATION_INTERVAL_MS: "1",
  });

  await runWithInput(
    ["hook", "--source", clientSourceId, "--agent", "claude_code"],
    environment,
    "{}",
  );
  await waitFor(async () => {
    const config = JSON.parse(await readFile(join(directory, "config.json"), "utf8"));
    return currentRequests === 1 && config.sources.length === 0;
  });
  await waitFor(async () => {
    try {
      await access(join(directory, "scheduler.lock"));
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(usageRequests, 0);
  await assert.rejects(access(trace));
  assert.doesNotMatch(await readFile(join(root, "settings.json"), "utf8"), /viberacing-hook/);
  const state = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
  assert.equal(state.sequences?.[sourceId], undefined);
  assert.equal(state.adapters?.[sourceId], undefined);
  assert.equal(state.fingerprints?.[sourceId], undefined);
  assert.equal((await readLocalSources(directory))[0].clientSourceId, clientSourceId);

  await runWithInput(
    ["hook", "--source", clientSourceId, "--agent", "claude_code"],
    environment,
    "{}",
  );
  await delay(150);
  assert.equal(currentRequests, 1);
  assert.equal(usageRequests, 0);
  await assert.rejects(access(trace));
});

test("remote reconciliation cannot restore retired runtime state from a stale snapshot", async (context) => {
  const retiredSourceId = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";
  const activeSourceId = "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2";
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify(
        reconciliationResponse([
          {
            sourceId: retiredSourceId,
            agentId: "qwen_code",
            collectionMethod: "qwen_stats_jsonl",
            status: "disconnected",
            lastAcceptedSyncSequence: "4",
          },
          {
            sourceId: activeSourceId,
            agentId: "antigravity",
            collectionMethod: "antigravity_cli_capture",
            status: "active",
            lastAcceptedSyncSequence: "7",
          },
        ]),
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-reconcile-fresh-state-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const qwenRoot = join(home, "qwen-retired");
  const capture = join(home, "active-capture.jsonl");
  const date = new Date().toISOString().slice(0, 10);
  await writeFile(
    capture,
    `${JSON.stringify({
      id: "active-event",
      date,
      usage: { date, totalTokens: "7", inputTokens: "3", outputTokens: "4" },
    })}\n`,
  );
  const retired = {
    clientSourceId: "b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3",
    sourceId: retiredSourceId,
    agentId: "qwen_code",
    dataPath: qwenRoot,
    hookConfigRoot: qwenRoot,
    collectionMethod: "qwen_stats_jsonl",
    supportedSurface: "cli",
    suggestedLabel: "Retired",
  };
  const active = {
    clientSourceId: "b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4",
    sourceId: activeSourceId,
    agentId: "antigravity",
    dataPath: capture,
    collectionMethod: "antigravity_cli_capture",
    supportedSurface: "cli",
    suggestedLabel: "Active",
  };
  const directory = await writeMappedInstallation(home, `http://127.0.0.1:${address.port}`, [
    retired,
    active,
  ]);
  await mkdir(qwenRoot, { recursive: true });
  await writeFile(
    join(qwenRoot, "settings.json"),
    JSON.stringify({
      hooks: {
        SessionEnd: [
          {
            hooks: [
              {
                type: "command",
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${retired.clientSourceId}`,
              },
            ],
          },
        ],
      },
    }),
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [retiredSourceId]: "4", [activeSourceId]: "0" },
      adapters: { [retiredSourceId]: { offset: 99 } },
      fingerprints: { [retiredSourceId]: "retired-fingerprint" },
      quarantine: { [retiredSourceId]: "invalid_payload" },
    })}\n`,
  );

  await execFileAsync(process.execPath, [connectorPath, "doctor"], {
    env: connectorEnvironment(home),
  });
  const state = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
  assert.equal(state.sequences[activeSourceId], "7");
  assert.equal(state.sequences[retiredSourceId], undefined);
  assert.equal(state.adapters?.[retiredSourceId], undefined);
  assert.equal(state.fingerprints?.[retiredSourceId], undefined);
  assert.equal(state.quarantine?.[retiredSourceId], undefined);
  assert.doesNotMatch(await readFile(join(qwenRoot, "settings.json"), "utf8"), /viberacing/);
});

test("recovers a missing local sequence from 500 and sends snapshot 501", async (context) => {
  let uploaded;
  let uploadCount = 0;
  const sourceId = "66666666-6666-4666-8666-666666666666";
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/api/installations/current") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify(reconciliationResponse([{ sourceId, lastAcceptedSyncSequence: "500" }])),
      );
      return;
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      uploadCount += 1;
      uploaded = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify(
          usageResponse(uploaded, {
            sourceSequences: [{ sourceId, lastAcceptedSyncSequence: "501", accepted: true }],
          }),
        ),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-sequence-recovery-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  const clientSourceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const capture = join(directory, "captures", `${clientSourceId}.jsonl`);
  await mkdir(join(directory, "captures"), { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    capture,
    `${JSON.stringify({
      id: "synthetic-sequence-event",
      date: today,
      usage: {
        date: today,
        totalTokens: "1",
        inputTokens: "1",
        outputTokens: "0",
        cacheReadTokens: "0",
        cacheWriteTokens: "0",
        reasoningTokens: "0",
      },
    })}\n`,
  );
  await writeLocalSources(directory, [
    {
      clientSourceId,
      agentId: "antigravity",
      dataPath: capture,
      collectionMethod: "antigravity_cli_capture",
      supportedSurface: "cli",
      suggestedLabel: "Antigravity",
    },
  ]);
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin: `http://127.0.0.1:${address.port}`,
      deviceToken: "synthetic-device-token",
      sources: [
        {
          clientSourceId,
          sourceId,
          agentId: "antigravity",
          accountLabel: "Antigravity",
          collectionMethod: "antigravity_cli_capture",
          lastAcceptedSyncSequence: "0",
        },
      ],
    })}\n`,
  );
  await execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: connectorEnvironment(home),
  });
  assert.equal(uploaded.snapshots[0].syncSequence, "501");
  assert.equal(
    JSON.parse(await readFile(join(directory, "state.json"), "utf8")).sequences[sourceId],
    "501",
  );
  const unchanged = await execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: connectorEnvironment(home),
  });
  assert.equal(uploadCount, 1);
  assert.match(unchanged.stdout, /no request was sent/i);
});

test("repairs one stale pending snapshot and still delivers the newly collected snapshot", async (context) => {
  const bodies = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      bodies.push(body);
      const sequence = bodies.length === 1 ? "500" : bodies.length === 2 ? "501" : "502";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify(
          usageResponse(body, {
            acceptedEntries: bodies.length === 3 ? 1 : 0,
            acceptedSnapshots: bodies.length === 1 ? 0 : 1,
            staleSnapshots: bodies.length === 1 ? 1 : 0,
            sourceSequences: [
              {
                sourceId: body.snapshots[0].sourceId,
                lastAcceptedSyncSequence: sequence,
                accepted: bodies.length !== 1,
              },
            ],
          }),
        ),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-stale-pending-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  await mkdir(join(installation.directory, "pending"), { recursive: true });
  await writeFile(
    join(installation.directory, "state.json"),
    `${JSON.stringify({ version: 1, sequences: { [installation.sourceId]: "1" } })}\n`,
  );
  await writeFile(
    join(installation.directory, "pending", `${installation.sourceId}.json`),
    `${JSON.stringify({
      protocolVersion: 2,
      snapshots: [
        {
          sourceId: installation.sourceId,
          syncSequence: "1",
          rangeStart: "2026-07-15",
          rangeEnd: "2026-08-14",
          completeness: "complete",
          entries: [],
        },
      ],
      sourceErrors: [],
    })}\n`,
  );

  await execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: connectorEnvironment(home),
  });
  assert.deepEqual(
    bodies.map((body) => body.snapshots[0].syncSequence),
    ["1", "501", "502"],
  );
  assert.equal(
    JSON.parse(await readFile(join(installation.directory, "state.json"), "utf8")).sequences[
      installation.sourceId
    ],
    "502",
  );
});

test("retries transient uploads at most three times and clears the compact pending snapshot", async (context) => {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/api/installations/current") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(reconciliationResponse([{ sourceId: installation.sourceId }])));
      return;
    }
    requests += 1;
    response.writeHead(requests < 3 ? 503 : 200, { "content-type": "application/json" });
    response.end(
      JSON.stringify(
        requests < 3
          ? { error: "server_error" }
          : usageResponse({
              snapshots: [{ sourceId: installation.sourceId, syncSequence: "1", entries: [] }],
              sourceErrors: [],
            }),
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-transient-retry-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);

  await execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: connectorEnvironment(home),
  });
  assert.equal(requests, 3);
  assert.deepEqual(
    await import("node:fs/promises").then(({ readdir }) =>
      readdir(join(installation.directory, "pending")),
    ),
    [],
  );
});

test("retries transient malformed proxy responses without accepting them", async (context) => {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/api/installations/current") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(reconciliationResponse([{ sourceId: installation.sourceId }])));
      return;
    }
    requests += 1;
    if (requests < 3) {
      response.writeHead(503, { "content-type": "text/html" });
      response.end("<html>temporary proxy failure</html>");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify(
        usageResponse({
          snapshots: [{ sourceId: installation.sourceId, syncSequence: "1", entries: [] }],
          sourceErrors: [],
        }),
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-malformed-transient-retry-"));
  context.after(() => rm(home, { recursive: true }));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);

  await execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: connectorEnvironment(home),
  });
  assert.equal(requests, 3);
});

test("honors Retry-After before retrying a rate-limited upload", async (context) => {
  const requestTimes = [];
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/api/installations/current") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(reconciliationResponse([{ sourceId: installation.sourceId }])));
      return;
    }
    requestTimes.push(Date.now());
    response.writeHead(requestTimes.length === 1 ? 429 : 200, {
      "content-type": "application/json",
      ...(requestTimes.length === 1 ? { "retry-after": "1" } : {}),
    });
    response.end(
      JSON.stringify(
        requestTimes.length === 1
          ? { error: "rate_limited" }
          : usageResponse({
              snapshots: [{ sourceId: installation.sourceId, syncSequence: "1", entries: [] }],
              sourceErrors: [],
            }),
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-retry-after-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);

  await execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: connectorEnvironment(home, {
      NODE_ENV: "test",
      VIBERACING_TEST_MAX_RETRY_AFTER_MS: "1000",
    }),
  });
  assert.equal(requestTimes.length, 2);
  assert.ok(
    requestTimes[1] - requestTimes[0] >= 900,
    `retry happened after only ${requestTimes[1] - requestTimes[0]}ms`,
  );
});

test("quarantines a permanent 400 once without blocking the next corrected snapshot", async (context) => {
  let requests = 0;
  const bodies = [];
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/api/installations/current") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(reconciliationResponse([{ sourceId: installation.sourceId }])));
      return;
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests += 1;
      bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      response.writeHead(requests === 1 ? 400 : 200, { "content-type": "application/json" });
      response.end(
        JSON.stringify(
          requests === 1 ? { error: "token_components_mismatch" } : usageResponse(bodies.at(-1)),
        ),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-permanent-quarantine-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);

  const rejected = await execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: connectorEnvironment(home),
  });
  assert.equal(requests, 1);
  assert.match(rejected.stderr, /payload quarantined/);
  const quarantine = join(
    installation.directory,
    "pending",
    "quarantine",
    `${installation.sourceId}.json`,
  );
  await access(quarantine);

  const capture = JSON.parse((await readFile(installation.capture, "utf8")).trim());
  capture.id = "synthetic-corrected-event-with-a-longer-id";
  capture.usage.totalTokens = "4";
  capture.usage.outputTokens = "3";
  await writeFile(installation.capture, `${JSON.stringify(capture)}\n`);
  await execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: connectorEnvironment(home),
  });
  assert.equal(requests, 2);
  assert.equal(bodies[1].snapshots[0].syncSequence, "2");
  await assert.rejects(access(quarantine));
});

test("revoked authorization removes pairing config and stops automatic scheduling", async (context) => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "unauthorized" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const home = await mkdtemp(join(tmpdir(), "viberacing-revoked-auth-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  await writeFile(
    join(installation.directory, "dirty.json"),
    `${JSON.stringify({ dirtySince: new Date().toISOString(), lastEventAt: new Date().toISOString() })}\n`,
  );

  await assert.rejects(
    execFileAsync(process.execPath, [connectorPath, "sync"], {
      env: connectorEnvironment(home),
    }),
    /authorization was revoked/,
  );
  assert.equal(requests, 1);
  await assert.rejects(access(join(installation.directory, "config.json")));
  await assert.rejects(access(join(installation.directory, "dirty.json")));
});

test("uploads the supported 32 sources in bounded batches below the server rate limit", async (context) => {
  const bodies = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      bodies.push(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-maximum-batch-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  const pending = join(directory, "pending");
  await mkdir(pending, { recursive: true });
  const sources = Array.from({ length: 32 }, (_, index) => {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    return {
      clientSourceId: id,
      sourceId: id,
      agentId: "unsupported",
      collectionMethod: "unsupported",
      supportedSurface: "cli",
      accountLabel: `Unsupported ${index}`,
    };
  });
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin: `http://127.0.0.1:${address.port}`,
      deviceToken: "synthetic-device-token",
      sources,
    })}\n`,
  );
  await writeLocalSources(
    directory,
    sources.map((source, index) => ({
      clientSourceId: source.clientSourceId,
      agentId: source.agentId,
      dataPath: join(home, `unsupported-${index}`),
      collectionMethod: source.collectionMethod,
      supportedSurface: source.supportedSurface,
      suggestedLabel: `Unsupported ${index}`,
    })),
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: Object.fromEntries(sources.map((source) => [source.sourceId, "1"])),
    })}\n`,
  );
  for (const source of sources)
    await writeFile(
      join(pending, `${source.sourceId}.json`),
      `${JSON.stringify({
        protocolVersion: 2,
        snapshots: [{ sourceId: source.sourceId, syncSequence: "1", entries: [] }],
        sourceErrors: [],
      })}\n`,
    );

  await assert.rejects(
    execFileAsync(process.execPath, [connectorPath, "sync"], {
      env: connectorEnvironment(home),
    }),
    /Unsupported configured source/,
  );
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].snapshots.length, 32);
  assert.equal(bodies[1].sourceErrors.length, 32);
});

test("reconnect replaces authorization after an in-flight sync without token resurrection", async (context) => {
  let releaseOldUpload;
  let oldUploadStarted;
  const oldUpload = new Promise((resolve) => (oldUploadStarted = resolve));
  const oldUploadCanFinish = new Promise((resolve) => (releaseOldUpload = resolve));
  context.after(() => releaseOldUpload());
  const authorizations = [];
  let installation;
  let replacementInstallationId;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (request.url === "/api/pairing/start") {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        replacementInstallationId = body.installationId;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            installationId: body.installationId,
            pollToken: "replacement_poll_token_that_is_long_enough",
            verificationUrl: `http://${request.headers.host}/connect?code=RECONNEC`,
            code: "RECONNEC",
            expiresInSeconds: 30,
          }),
        );
        return;
      }
      if (request.url === "/api/pairing/poll") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            status: "active",
            deviceToken: "replacement-device-token-that-is-long-enough",
            protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
            sources: [
              {
                clientSourceId: installation.clientSourceId,
                sourceId: installation.sourceId,
                agentAccountId: "71717171-7171-4171-8171-717171717171",
                agentId: "antigravity",
                accountLabel: "Antigravity",
                collectionMethod: "antigravity_cli_capture",
                lastAcceptedSyncSequence: "0",
              },
            ],
          }),
        );
        return;
      }
      if (request.url !== "/api/usage") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      const authorization = request.headers.authorization;
      authorizations.push(authorization);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const finish = () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(usageResponse(body)));
      };
      if (authorization?.includes("synthetic-device-token")) {
        oldUploadStarted();
        oldUploadCanFinish.then(finish);
      } else finish();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-reconnect-sync-race-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  await writeFile(
    join(installation.directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [installation.sourceId]: "0" },
      automaticDisabledReason: "unsupported_connector",
    })}\n`,
  );
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    PATH: "",
    VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
  });
  const oldSync = execFileAsync(process.execPath, [connectorPath, "sync"], { env: environment });
  await oldUpload;
  const reconnect = execFileAsync(
    process.execPath,
    [connectorPath, "connect", "--origin", `http://127.0.0.1:${address.port}`],
    { env: environment },
  );
  await waitFor(() =>
    access(join(installation.directory, "lifecycle-revoking.lock")).then(
      () => true,
      () => false,
    ),
  );
  assert.equal(
    JSON.parse(await readFile(join(installation.directory, "config.json"), "utf8")).deviceToken,
    "synthetic-device-token-that-is-long-enough",
  );

  releaseOldUpload();
  const oldResult = await oldSync.catch((error) => error);
  assert.equal(oldResult.code, 1);
  assert.match(oldResult.stderr, /stopped by a local lifecycle operation/i);
  await reconnect;

  const config = JSON.parse(await readFile(join(installation.directory, "config.json"), "utf8"));
  assert.equal(config.deviceToken, "replacement-device-token-that-is-long-enough");
  assert.equal(config.installationId, replacementInstallationId);
  const state = JSON.parse(await readFile(join(installation.directory, "state.json"), "utf8"));
  assert.equal(state.automaticDisabledReason, undefined);
  assert.deepEqual(authorizations, [
    "Bearer synthetic-device-token-that-is-long-enough",
    "Bearer replacement-device-token-that-is-long-enough",
  ]);
});

test("disconnect serializes with an in-flight sync and prevents state resurrection", async (context) => {
  const methods = [];
  let releaseUpload;
  let uploadStarted;
  const firstUpload = new Promise((resolve) => {
    uploadStarted = resolve;
  });
  const uploadCanFinish = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  context.after(() => releaseUpload());
  const server = createServer((request, response) => {
    methods.push(request.method);
    request.resume();
    request.on("end", () => {
      if (request.method === "DELETE") {
        response.writeHead(204);
        response.end();
        return;
      }
      uploadStarted();
      uploadCanFinish.then(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            usageResponse({
              snapshots: [{ sourceId: installation.sourceId, syncSequence: "1", entries: [{}] }],
              sourceErrors: [],
            }),
          ),
        );
      });
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-disconnect-sync-race-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const installation = await writeCaptureInstallation(home, `http://127.0.0.1:${address.port}`);
  const environment = connectorEnvironment(home);
  const syncPromise = execFileAsync(process.execPath, [connectorPath, "sync"], {
    env: environment,
  });
  await firstUpload;
  const disconnectPromise = execFileAsync(process.execPath, [connectorPath, "disconnect"], {
    env: environment,
  });
  await waitFor(() =>
    access(join(installation.directory, "lifecycle-revoking.lock")).then(
      () => true,
      () => false,
    ),
  );
  assert.equal(
    await Promise.race([
      disconnectPromise.then(() => "finished"),
      delay(100).then(() => "waiting"),
    ]),
    "waiting",
  );

  releaseUpload();
  const syncResult = await syncPromise.catch((error) => error);
  assert.equal(syncResult.code, 1);
  assert.match(syncResult.stderr, /stopped by a local lifecycle operation/i);
  await disconnectPromise;
  assert.deepEqual(methods, ["POST", "DELETE"]);
  await assert.rejects(access(join(installation.directory, "config.json")));
  await assert.rejects(access(join(installation.directory, "dirty.json")));
  assert.deepEqual(
    await readdir(join(installation.directory, "pending")).catch((error) =>
      error?.code === "ENOENT" ? [] : Promise.reject(error),
    ),
    [],
  );
  await delay(150);
  assert.deepEqual(methods, ["POST", "DELETE"]);
});

test("disconnect removes local hooks, token, dirty state, and pending data when offline", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-offline-disconnect-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  const qwenRoot = join(home, ".qwen");
  const qwenUsage = join(qwenRoot, "usage");
  await mkdir(join(directory, "pending"), { recursive: true });
  await mkdir(qwenUsage, { recursive: true });
  await mkdir(join(home, ".claude"), { recursive: true });
  await writeFile(join(home, ".claude", "settings.json"), "{invalid-json");
  const clientSourceId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const sourceId = "77777777-7777-4777-8777-777777777777";
  await writeLocalSources(directory, [
    {
      clientSourceId,
      agentId: "qwen_code",
      dataPath: qwenUsage,
      collectionMethod: "qwen_stats_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Qwen",
    },
  ]);
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin: "http://127.0.0.1:1",
      deviceToken: "synthetic-device-token-that-is-long-enough",
      sources: [
        {
          clientSourceId,
          sourceId,
          agentId: "qwen_code",
          accountLabel: "Qwen",
          collectionMethod: "qwen_stats_jsonl",
        },
      ],
    })}\n`,
  );
  await writeFile(
    join(qwenRoot, "settings.json"),
    JSON.stringify({
      hooks: {
        SessionEnd: [
          { hooks: [{ type: "command", command: "keep-me" }] },
          {
            hooks: [
              {
                type: "command",
                command: "node hook --viberacing-hook-id=viberacing-hook-v2",
              },
            ],
          },
        ],
      },
    }),
  );
  await writeFile(
    join(directory, "pending", `${sourceId}.json`),
    `${JSON.stringify({
      protocolVersion: 2,
      snapshots: [{ sourceId, syncSequence: "1", entries: [] }],
      sourceErrors: [],
    })}\n`,
  );
  await writeFile(
    join(directory, "dirty.json"),
    `${JSON.stringify({ dirtySince: new Date().toISOString(), lastEventAt: new Date().toISOString() })}\n`,
  );
  const result = await execFileAsync(process.execPath, [connectorPath, "disconnect"], {
    env: connectorEnvironment(home),
  });
  assert.match(result.stderr, /remote revoke could not be confirmed/);
  assert.match(result.stderr, /auxiliary cleanup steps/);
  await assert.rejects(access(join(directory, "config.json")));
  await assert.rejects(access(join(directory, "dirty.json")));
  await assert.rejects(access(join(directory, "pending", `${sourceId}.json`)));
  assert.match(await readFile(join(qwenRoot, "settings.json"), "utf8"), /keep-me/);
  assert.doesNotMatch(
    await readFile(join(qwenRoot, "settings.json"), "utf8"),
    /viberacing-hook-v2/,
  );
  assert.equal((await readLocalSources(directory)).length, 1);
});

test("disconnected commands are clear and disconnect remains idempotent", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-already-disconnected-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const environment = connectorEnvironment(home);

  for (const command of ["sync", "accounts"]) {
    const result = await execFileAsync(process.execPath, [connectorPath, command], {
      env: environment,
    }).catch((error) => error);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /This computer is not connected/);
    assert.doesNotMatch(result.stderr, /ENOENT|config\.json/);
  }

  const result = await execFileAsync(process.execPath, [connectorPath, "disconnect"], {
    env: environment,
  });
  assert.match(result.stdout, /Installation disconnected locally/);
  assert.equal(result.stderr, "");
});

test("disconnect warns when a pending pairing cancellation cannot be confirmed without config", async (context) => {
  let cancellationRequests = 0;
  const server = createServer((request) => {
    if (request.url === "/api/pairing/cancel" && request.method === "POST") {
      cancellationRequests += 1;
      request.socket.destroy();
      return;
    }
    request.socket.destroy();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const home = await mkdtemp(join(tmpdir(), "viberacing-unconfirmed-pairing-cancel-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const directory = join(home, ".viberacing");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".viberacing-state"), '{"format":1}\n');
  await writeFile(
    join(directory, "connect-attempt.json"),
    `${JSON.stringify({
      version: 1,
      attemptId: randomUUID(),
      installationId: randomUUID(),
      sourceRegistryRevision: randomUUID(),
      origin: `http://127.0.0.1:${address.port}`,
      startedAt: new Date().toISOString(),
      pollToken: "unconfirmed_pairing_poll_token_long_enough",
    })}\n`,
  );

  const environment = connectorEnvironment(home);
  const result = await execFileAsync(process.execPath, [connectorPath, "disconnect"], {
    env: environment,
  });
  assert.match(result.stdout, /Installation disconnected locally/);
  assert.match(result.stderr, /remote pairing cancellation could not be confirmed/i);
  assert.equal(cancellationRequests, 1);
  await assert.rejects(access(join(directory, "connect-attempt.json")));
  await assert.rejects(access(join(directory, "config.json")));

  const repeated = await execFileAsync(process.execPath, [connectorPath, "disconnect"], {
    env: environment,
  });
  assert.equal(repeated.stderr, "");
  assert.equal(cancellationRequests, 1);
});

test("successful installation revoke confirms only the matching failed pairing cancellation", async (context) => {
  let cancellationRequests = 0;
  let revocationRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/api/pairing/cancel" && request.method === "POST") {
      cancellationRequests += 1;
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "server_error" }));
      return;
    }
    if (request.url === "/api/installations/current" && request.method === "DELETE") {
      revocationRequests += 1;
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  const alternateServer = createServer((request, response) => {
    if (request.url === "/api/pairing/cancel" && request.method === "POST") {
      cancellationRequests += 1;
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "server_error" }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  alternateServer.listen(0, "127.0.0.1");
  await once(alternateServer, "listening");
  context.after(() => alternateServer.close());
  const alternateAddress = alternateServer.address();
  assert.notEqual(alternateAddress, null);
  assert.equal(typeof alternateAddress, "object");

  const origin = `http://127.0.0.1:${address.port}`;
  const alternateOrigin = `http://127.0.0.1:${alternateAddress.port}`;
  const runScenario = async ({
    name,
    configInstallationId,
    attemptInstallationId,
    attemptOrigin = origin,
    warns,
  }) => {
    const home = await mkdtemp(join(tmpdir(), `viberacing-pairing-cancel-${name}-`));
    context.after(() => rm(home, { recursive: true, force: true }));
    const { directory } = await writeCaptureInstallation(
      home,
      origin,
      configInstallationId === undefined ? {} : { installationId: configInstallationId },
    );
    await writeFile(
      join(directory, "connect-attempt.json"),
      `${JSON.stringify({
        version: 1,
        attemptId: randomUUID(),
        installationId: attemptInstallationId,
        sourceRegistryRevision: randomUUID(),
        origin: attemptOrigin,
        startedAt: new Date().toISOString(),
        pollToken: `${name}_fallback_pairing_poll_token_long_enough`,
      })}\n`,
    );

    const result = await execFileAsync(process.execPath, [connectorPath, "disconnect"], {
      env: connectorEnvironment(home),
    });
    assert.match(result.stdout, /Installation disconnected locally/);
    if (warns) assert.match(result.stderr, /remote pairing cancellation could not be confirmed/i);
    else assert.doesNotMatch(result.stderr, /remote pairing cancellation could not be confirmed/i);
    assert.doesNotMatch(result.stderr, /remote revoke could not be confirmed/i);
    await assert.rejects(access(join(directory, "connect-attempt.json")));
    await assert.rejects(access(join(directory, "config.json")));
  };

  const matchingInstallationId = randomUUID();
  await runScenario({
    name: "matching",
    configInstallationId: matchingInstallationId,
    attemptInstallationId: matchingInstallationId,
    warns: false,
  });
  await runScenario({
    name: "mismatched",
    configInstallationId: randomUUID(),
    attemptInstallationId: randomUUID(),
    warns: true,
  });
  const originMismatchInstallationId = randomUUID();
  await runScenario({
    name: "origin-mismatched",
    configInstallationId: originMismatchInstallationId,
    attemptInstallationId: originMismatchInstallationId,
    attemptOrigin: alternateOrigin,
    warns: true,
  });
  await runScenario({
    name: "legacy",
    configInstallationId: undefined,
    attemptInstallationId: randomUUID(),
    warns: true,
  });
  assert.equal(cancellationRequests, 4);
  assert.equal(revocationRequests, 4);
});

test("uninstall removes v2 and source-owned hooks from remembered custom roots", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-uninstall-custom-roots-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  const root = join(home, "gemini-custom");
  const clientSourceId = "88888888-8888-4888-8888-888888888888";
  await mkdir(root, { recursive: true });
  await mkdir(directory, { recursive: true });
  await writeLocalSources(directory, [
    {
      clientSourceId,
      agentId: "gemini_cli",
      dataPath: root,
      collectionMethod: "gemini_session_json",
      supportedSurface: "cli",
      suggestedLabel: "Custom",
    },
  ]);
  await writeFile(
    join(root, "settings.json"),
    JSON.stringify({
      hooks: {
        SessionEnd: [
          { hooks: [{ type: "command", command: "keep-foreign" }] },
          {
            hooks: [
              {
                type: "command",
                command: "node legacy --viberacing-hook-id=viberacing-hook-v2",
              },
              {
                type: "command",
                command: `node current --viberacing-hook-id=viberacing-hook-v3:${clientSourceId}`,
              },
            ],
          },
        ],
      },
    }),
  );
  await execFileAsync(process.execPath, [connectorPath, "uninstall"], {
    env: connectorEnvironment(home),
  });
  await assert.rejects(access(directory));
  const settings = await readFile(join(root, "settings.json"), "utf8");
  assert.match(settings, /keep-foreign/);
  assert.doesNotMatch(settings, /viberacing-hook-v[23]/);
});

test("uninstall cleans later roots and retains failed-root metadata for an idempotent retry", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "viberacing-uninstall-partial-hooks-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
  const directory = join(home, ".viberacing");
  const brokenRoot = join(home, "broken-qwen");
  const geminiRoot = join(home, "gemini-work");
  const claudeRoot = join(home, "claude-personal");
  const sources = [
    {
      clientSourceId: "91919191-9191-4191-8191-919191919191",
      sourceId: "92929292-9292-4292-8292-929292929292",
      agentId: "qwen_code",
      dataPath: brokenRoot,
      hookConfigRoot: brokenRoot,
      collectionMethod: "qwen_stats_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Broken first",
    },
    {
      clientSourceId: "93939393-9393-4393-8393-939393939393",
      sourceId: "94949494-9494-4494-8494-949494949494",
      agentId: "gemini_cli",
      dataPath: geminiRoot,
      collectionMethod: "gemini_session_json",
      supportedSurface: "cli",
      suggestedLabel: "Gemini after",
    },
    {
      clientSourceId: "95959595-9595-4595-8595-959595959595",
      sourceId: "96969696-9696-4696-8696-969696969696",
      agentId: "claude_code",
      dataPath: claudeRoot,
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Claude after",
    },
  ];
  await writeMappedInstallation(home, "http://127.0.0.1:1", sources);
  await mkdir(join(directory, "bin"), { recursive: true });
  await writeFile(join(directory, "bin", "viberacing.mjs"), "// retained cleanup runtime\n");
  await writeFile(
    join(directory, "installation.json"),
    `${JSON.stringify({ version: 1, installationId: "synthetic-secret" })}\n`,
  );
  for (const root of [brokenRoot, geminiRoot, claudeRoot]) await mkdir(root, { recursive: true });
  await writeFile(join(brokenRoot, "settings.json"), "{ invalid json");
  const ownedSettings = (source, event) =>
    JSON.stringify({
      hooks: {
        [event]: [
          { hooks: [{ type: "command", command: "keep-foreign" }] },
          {
            hooks: [
              {
                type: "command",
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${source.clientSourceId}`,
              },
            ],
          },
        ],
      },
    });
  await writeFile(join(geminiRoot, "settings.json"), ownedSettings(sources[1], "SessionEnd"));
  await writeFile(join(claudeRoot, "settings.json"), ownedSettings(sources[2], "Stop"));
  const environment = connectorEnvironment(home);

  const first = await runWithInput(["uninstall"], environment, "");
  assert.equal(first.code, 1);
  assert.match(first.stderr, /1 owned hook root/i);
  assert.match(first.stderr, /broken-qwen/);
  assert.doesNotMatch(await readFile(join(geminiRoot, "settings.json"), "utf8"), /viberacing/);
  assert.doesNotMatch(await readFile(join(claudeRoot, "settings.json"), "utf8"), /viberacing/);
  assert.match(await readFile(join(geminiRoot, "settings.json"), "utf8"), /keep-foreign/);
  assert.match(await readFile(join(claudeRoot, "settings.json"), "utf8"), /keep-foreign/);
  assert.equal((await readLocalSources(directory)).length, 3);
  await access(join(directory, "bin", "viberacing.mjs"));
  await assert.rejects(access(join(directory, "config.json")));
  await assert.rejects(access(join(directory, "installation.json")));

  await writeFile(join(brokenRoot, "settings.json"), ownedSettings(sources[0], "SessionEnd"));
  const second = await runWithInput(["uninstall"], environment, "");
  assert.equal(second.code, 0);
  await assert.rejects(access(directory));
  assert.doesNotMatch(await readFile(join(brokenRoot, "settings.json"), "utf8"), /viberacing/);
});

test(
  "wrapper passes exact argv and preserves native output and safe metadata",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(join(tmpdir(), "viberacing-wrapper-executable-"));
    context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
    const bin = join(home, "bin");
    await mkdir(bin, { recursive: true });
    const antigravityArgv = join(home, "antigravity-argv.json");
    const antigravityExecutable = join(bin, "agy");
    await writeFile(
      antigravityExecutable,
      `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nwriteFileSync(process.env.SYNTHETIC_ARGV_PATH, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write(JSON.stringify({type:"result",session_id:"safe-session",timestamp:new Date().toISOString(),prompt:"synthetic private prompt",response:"synthetic private response",usage:{input_tokens:1,output_tokens:2,cache_read_tokens:0,cache_write_tokens:0}})+"\\n");\n`,
    );
    await chmod(antigravityExecutable, 0o700);
    const environment = connectorEnvironment(home, {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
    });

    await execFileAsync(
      process.execPath,
      [connectorPath, "run", "antigravity", "--", "-p", "hello", "--output-format=stream-json"],
      { env: { ...environment, SYNTHETIC_ARGV_PATH: antigravityArgv } },
    );
    assert.deepEqual(JSON.parse(await readFile(antigravityArgv, "utf8")), [
      "-p",
      "hello",
      "--output-format=stream-json",
    ]);
    const antigravitySource = (await readLocalSources(join(home, ".viberacing"))).find(
      (source) => source.agentId === "antigravity",
    );
    assert.ok(antigravitySource);
    assert.match(
      antigravitySource.dataPath,
      new RegExp(`${antigravitySource.clientSourceId}\\.jsonl$`),
    );
    const capture = await readFile(antigravitySource.dataPath, "utf8");
    assert.match(capture, /safe-session/);
    assert.doesNotMatch(capture, /prompt|response|synthetic private/);
    await execFileAsync(process.execPath, [connectorPath, "disconnect"], { env: environment });
  },
);

test(
  "Antigravity wrapper waits for a busy launch gate before persisting capture and dirty state",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(join(tmpdir(), "viberacing-wrapper-busy-launch-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const installation = await writeCaptureInstallation(home, "http://127.0.0.1:9", {
      eventId: "initial-capture",
    });
    const bin = join(home, "bin");
    await mkdir(bin, { recursive: true });
    const executable = join(bin, "agy");
    await writeFile(
      executable,
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({type:"result",session_id:"gate-wait-record",timestamp:new Date().toISOString(),usage:{input_tokens:4,output_tokens:5}})+"\\n");
`,
    );
    await chmod(executable, 0o700);

    const holderBarrier = join(home, "launch-holder");
    const wrapperReady = join(home, "wrapper-capture-ready");
    const schedulerTrace = join(home, "scheduler-trace.log");
    const environment = connectorEnvironment(home, {
      NODE_ENV: "test",
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      VIBERACING_TEST_WRAPPER_CAPTURE_READY: wrapperReady,
      VIBERACING_TEST_SCHEDULER_TRACE: schedulerTrace,
      VIBERACING_TEST_AUTOMATIC_SYNC_TIMINGS: "5000,5000,5000",
    });
    const runtimeUrl = pathToFileURL(
      fileURLToPath(new URL("../lib/runtime.mjs", import.meta.url)),
    ).href;
    const holderScript = `
      import { readFile, writeFile } from "node:fs/promises";
      import { setTimeout as delay } from "node:timers/promises";
      import { claimSchedulerLaunch, releaseSchedulerLaunch } from ${JSON.stringify(runtimeUrl)};
      const gate = await claimSchedulerLaunch({ waitMs: 0 });
      if (!gate) throw new Error("launch gate unavailable");
      await writeFile(${JSON.stringify(`${holderBarrier}.ready`)}, "ready\\n");
      for (;;) {
        try {
          await readFile(${JSON.stringify(`${holderBarrier}.continue`)});
          break;
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
        await delay(10);
      }
      await releaseSchedulerLaunch(gate);
    `;
    const holder = spawn(process.execPath, ["--input-type=module", "--eval", holderScript], {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    context.after(() => holder.kill("SIGKILL"));
    await waitFor(() =>
      access(`${holderBarrier}.ready`)
        .then(() => true)
        .catch(() => false),
    );

    const wrapper = spawn(process.execPath, [connectorPath, "run", "antigravity", "--", "review"], {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    context.after(() => wrapper.kill("SIGKILL"));
    let wrapperStdout = "";
    let wrapperStderr = "";
    wrapper.stdout.setEncoding("utf8").on("data", (chunk) => (wrapperStdout += chunk));
    wrapper.stderr.setEncoding("utf8").on("data", (chunk) => (wrapperStderr += chunk));
    await waitFor(() =>
      access(wrapperReady)
        .then(() => true)
        .catch(() => false),
    );
    assert.doesNotMatch(await readFile(installation.capture, "utf8"), /gate-wait-record/);

    await writeFile(`${holderBarrier}.continue`, "continue\n");
    const [holderCode] = await once(holder, "close");
    assert.equal(holderCode, 0);
    const [wrapperCode] = await once(wrapper, "close");
    assert.equal(wrapperCode, 0);
    assert.equal(wrapperStderr, "");
    assert.match(wrapperStdout, /gate-wait-record/);
    assert.match(await readFile(installation.capture, "utf8"), /gate-wait-record/);
    const dirty = JSON.parse(await readFile(join(installation.directory, "dirty.json"), "utf8"));
    assert.equal(typeof dirty.sources[installation.clientSourceId]?.generation, "string");
    await waitFor(async () =>
      (await readFile(schedulerTrace, "utf8").catch(() => "")).includes("acquired:"),
    );

    await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { clearAutomaticState } from ${JSON.stringify(runtimeUrl)}; await clearAutomaticState();`,
      ],
      { env: environment },
    );
  },
);

test(
  "wrapper forwards SIGINT to the native executable",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(join(tmpdir(), "viberacing-wrapper-signal-"));
    context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
    const bin = join(home, "bin");
    await mkdir(bin, { recursive: true });
    const executable = join(bin, "agy");
    await writeFile(
      executable,
      '#!/usr/bin/env node\nprocess.stdout.write("ready\\n");\nsetInterval(() => {}, 1000);\n',
    );
    await chmod(executable, 0o700);
    const child = spawn(process.execPath, [connectorPath, "run", "antigravity", "--", "hello"], {
      env: connectorEnvironment(home, { PATH: `${bin}${delimiter}${process.env.PATH}` }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    context.after(() => child.kill("SIGKILL"));
    child.stdout.setEncoding("utf8");
    await new Promise((resolve) => child.stdout.once("data", resolve));
    child.kill("SIGINT");
    const [code, signal] = await once(child, "close");
    assert.equal(code, null);
    assert.equal(signal, "SIGINT");
  },
);

test(
  "a wrapper finishing after uninstall cannot recreate local state",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(join(tmpdir(), "viberacing-stale-wrapper-"));
    context.after(() => rm(home, { recursive: true, force: true }));
    const bin = join(home, "bin");
    const barrier = join(home, "wrapper-finish");
    await mkdir(bin, { recursive: true });
    const executable = join(bin, "agy");
    await writeFile(
      executable,
      `#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
writeFileSync(process.env.SYNTHETIC_WRAPPER_BARRIER + ".ready", "ready\\n");
while (!existsSync(process.env.SYNTHETIC_WRAPPER_BARRIER + ".continue")) await new Promise((resolve) => setTimeout(resolve, 10));
process.stdout.write(JSON.stringify({type:"result",session_id:"stale-wrapper",timestamp:new Date().toISOString(),usage:{input_tokens:1,output_tokens:2}})+"\\n");
`,
    );
    await chmod(executable, 0o700);
    const environment = connectorEnvironment(home, {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      SYNTHETIC_WRAPPER_BARRIER: barrier,
    });
    await execFileAsync(
      process.execPath,
      [connectorPath, "source", "add", "--agent", "antigravity", "--name", "Local"],
      { env: environment },
    );
    const wrapper = spawn(process.execPath, [connectorPath, "run", "antigravity", "--", "review"], {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitFor(() =>
      access(`${barrier}.ready`)
        .then(() => true)
        .catch(() => false),
    );
    await execFileAsync(process.execPath, [connectorPath, "uninstall"], { env: environment });
    await assert.rejects(access(join(home, ".viberacing")), { code: "ENOENT" });
    await writeFile(`${barrier}.continue`, "continue\n");
    const [code] = await once(wrapper, "close");
    assert.equal(code, 0);
    await delay(100);
    await assert.rejects(access(join(home, ".viberacing")), { code: "ENOENT" });
  },
);

test(
  "Antigravity wrapper selects source-specific profiles",
  { skip: process.platform === "win32" },
  async (context) => {
    const home = await mkdtemp(join(tmpdir(), "viberacing-wrapper-profiles-"));
    context.after(() => import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true })));
    const bin = join(home, "bin");
    await mkdir(bin, { recursive: true });
    await writeFile(
      join(bin, "agy"),
      `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs"; writeFileSync(process.env.SYNTHETIC_ARGV_PATH, JSON.stringify(process.argv.slice(2))); process.stdout.write(JSON.stringify({type:"result",session_id:process.env.SYNTHETIC_SESSION_ID,timestamp:new Date().toISOString(),prompt:"private",response:"private",usage:{input_tokens:2,output_tokens:3}})+"\\n");\n`,
    );
    await chmod(join(bin, "agy"), 0o700);
    const environment = connectorEnvironment(home, {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
    });
    for (const name of ["Personal", "Work"])
      await execFileAsync(
        process.execPath,
        [connectorPath, "source", "add", "--agent", "antigravity", "--name", name],
        { env: environment },
      );
    const antigravitySources = (await readLocalSources(join(home, ".viberacing"))).filter(
      (source) => source.agentId === "antigravity",
    );
    assert.equal(antigravitySources.length, 2);
    assert.notEqual(antigravitySources[0].dataPath, antigravitySources[1].dataPath);
    for (const source of antigravitySources)
      assert.match(source.dataPath, new RegExp(`${source.clientSourceId}\\.jsonl$`));
    await assert.rejects(
      execFileAsync(process.execPath, [connectorPath, "run", "antigravity", "--", "review"], {
        env: environment,
      }),
      /Multiple antigravity sources.*--source/,
    );
    for (let index = 0; index < antigravitySources.length; index += 1) {
      const source = antigravitySources[index];
      const argvPath = join(home, `agy-argv-${index}.json`);
      await execFileAsync(
        process.execPath,
        [
          connectorPath,
          "run",
          "antigravity",
          "--source",
          source.clientSourceId,
          "--",
          `native-${index}`,
        ],
        {
          env: {
            ...environment,
            SYNTHETIC_ARGV_PATH: argvPath,
            SYNTHETIC_SESSION_ID: `profile-${index}`,
          },
        },
      );
      assert.deepEqual(JSON.parse(await readFile(argvPath, "utf8")), [
        "--print",
        `native-${index}`,
        "--output-format",
        "stream-json",
      ]);
      const capture = await readFile(source.dataPath, "utf8");
      assert.match(capture, new RegExp(`profile-${index}`));
      assert.doesNotMatch(capture, /prompt|response|private/);
    }
    assert.doesNotMatch(await readFile(antigravitySources[0].dataPath, "utf8"), /profile-1/);
    assert.doesNotMatch(await readFile(antigravitySources[1].dataPath, "utf8"), /profile-0/);
  },
);

test("independent disconnected", async (context) => {
  let mode = "malformed";
  let pairingStarts = 0;
  let pairingBody;
  const installationId = "74747474-7474-4474-8474-747474747474";
  const retiredClientSourceId = "75757575-7575-4575-8575-757575757575";
  const activeClientSourceId = "76767676-7676-4676-8676-767676767676";
  const retiredSourceId = "77777777-7777-4777-8777-777777777777";
  const activeSourceId = "78787878-7878-4878-8878-787878787878";
  const activeMapping = {
    clientSourceId: activeClientSourceId,
    sourceId: activeSourceId,
    agentAccountId: "79797979-7979-4979-8979-797979797979",
    agentId: "antigravity",
    accountLabel: "Available",
    collectionMethod: "antigravity_cli_capture",
    lastAcceptedSyncSequence: "3",
  };
  const retiredMapping = {
    clientSourceId: retiredClientSourceId,
    sourceId: retiredSourceId,
    agentAccountId: "80808080-8080-4080-8080-808080808080",
    agentId: "claude_code",
    accountLabel: "Unavailable",
    collectionMethod: "claude_jsonl",
    lastAcceptedSyncSequence: "2",
  };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/installations/current") {
        if (mode === "malformed") {
          response.end(JSON.stringify(reconciliationResponse([activeMapping])));
          return;
        }
        if (mode === "transient") {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "server_error" }));
          return;
        }
        if (mode === "unauthorized") {
          response.statusCode = 401;
          response.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        response.end(
          JSON.stringify(
            reconciliationResponse([
              { ...retiredMapping, status: "disconnected" },
              { ...activeMapping, status: "active" },
            ]),
          ),
        );
        return;
      }
      if (request.url === "/api/pairing/start") {
        pairingStarts += 1;
        pairingBody = body;
        response.statusCode = 201;
        response.end(
          JSON.stringify({
            installationId,
            code: "ABCDEFGH",
            pollToken: "dashboard_disconnect_poll_token_long_enough",
            verificationUrl: `http://${request.headers.host}/connect?code=ABCDEFGH`,
            expiresInSeconds: 30,
          }),
        );
        return;
      }
      if (request.url === "/api/pairing/poll") {
        response.end(
          JSON.stringify({
            status: "active",
            deviceToken: "dashboard_disconnect_device_token_long_enough",
            protocol: {
              version: 2,
              snapshotDays: 31,
              maximumSources: 32,
              maximumEntries: 1_024,
            },
            sources: [activeMapping],
          }),
        );
        return;
      }
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const home = await mkdtemp(join(tmpdir(), "viberacing-dashboard-disconnect-reconnect-"));
  context.after(() => rm(home, { recursive: true }));
  const directory = join(home, ".viberacing");
  const capture = join(directory, "captures", `${activeClientSourceId}.jsonl`);
  const hookRoot = join(home, ".claude");
  await mkdir(join(directory, "captures"), { recursive: true });
  await mkdir(hookRoot, { recursive: true });
  await writeFile(capture, "");
  await writeLocalSources(directory, [
    {
      clientSourceId: retiredClientSourceId,
      agentId: "claude_code",
      dataPath: join(hookRoot, "projects"),
      hookConfigRoot: hookRoot,
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Unavailable",
    },
    {
      clientSourceId: activeClientSourceId,
      agentId: "antigravity",
      dataPath: capture,
      collectionMethod: "antigravity_cli_capture",
      supportedSurface: "cli",
      suggestedLabel: "Available",
    },
  ]);
  await writeFile(
    join(directory, "installation.json"),
    `${JSON.stringify({
      version: 1,
      id: installationId,
      secret: "dashboard_disconnect_installation_secret_long_enough",
    })}\n`,
  );
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin,
      installationId,
      deviceToken: "dashboard_disconnect_previous_token_long_enough",
      sources: [retiredMapping, activeMapping],
      protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
    })}\n`,
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [retiredSourceId]: "2", [activeSourceId]: "3" },
    })}\n`,
  );
  await writeFile(
    join(hookRoot, "settings.json"),
    `${JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ command: "keep-foreign" }] },
          {
            hooks: [
              {
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${retiredClientSourceId}`,
              },
            ],
          },
        ],
      },
    })}\n`,
  );
  const configBefore = await readFile(join(directory, "config.json"));
  const hookBefore = await readFile(join(hookRoot, "settings.json"));
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    PATH: "",
    VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
  });

  mode = "disconnected";
  await execFileAsync(process.execPath, [connectorPath, "connect", "--origin", origin], {
    env: environment,
  });
  assert.equal(pairingStarts, 1);
  assert.deepEqual(
    pairingBody.sources.map((source) => source.clientSourceId),
    [activeClientSourceId],
  );
  const connected = JSON.parse(await readFile(join(directory, "config.json"), "utf8"));
  assert.equal(connected.deviceToken, "dashboard_disconnect_device_token_long_enough");
  assert.deepEqual(
    connected.sources.map((source) => source.sourceId),
    [activeSourceId],
  );
  const hook = await readFile(join(hookRoot, "settings.json"), "utf8");
  assert.match(hook, /keep-foreign/);
  assert.doesNotMatch(hook, new RegExp(retiredClientSourceId));

});

test("independent revoked-401", async (context) => {
  let mode = "malformed";
  let pairingStarts = 0;
  let pairingBody;
  const installationId = "74747474-7474-4474-8474-747474747474";
  const retiredClientSourceId = "75757575-7575-4575-8575-757575757575";
  const activeClientSourceId = "76767676-7676-4676-8676-767676767676";
  const retiredSourceId = "77777777-7777-4777-8777-777777777777";
  const activeSourceId = "78787878-7878-4878-8878-787878787878";
  const activeMapping = {
    clientSourceId: activeClientSourceId,
    sourceId: activeSourceId,
    agentAccountId: "79797979-7979-4979-8979-797979797979",
    agentId: "antigravity",
    accountLabel: "Available",
    collectionMethod: "antigravity_cli_capture",
    lastAcceptedSyncSequence: "3",
  };
  const retiredMapping = {
    clientSourceId: retiredClientSourceId,
    sourceId: retiredSourceId,
    agentAccountId: "80808080-8080-4080-8080-808080808080",
    agentId: "claude_code",
    accountLabel: "Unavailable",
    collectionMethod: "claude_jsonl",
    lastAcceptedSyncSequence: "2",
  };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/installations/current") {
        if (mode === "malformed") {
          response.end(JSON.stringify(reconciliationResponse([activeMapping])));
          return;
        }
        if (mode === "transient") {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "server_error" }));
          return;
        }
        if (mode === "unauthorized") {
          response.statusCode = 401;
          response.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        response.end(
          JSON.stringify(
            reconciliationResponse([
              { ...retiredMapping, status: "disconnected" },
              { ...activeMapping, status: "active" },
            ]),
          ),
        );
        return;
      }
      if (request.url === "/api/pairing/start") {
        pairingStarts += 1;
        pairingBody = body;
        response.statusCode = 201;
        response.end(
          JSON.stringify({
            installationId,
            code: "ABCDEFGH",
            pollToken: "dashboard_disconnect_poll_token_long_enough",
            verificationUrl: `http://${request.headers.host}/connect?code=ABCDEFGH`,
            expiresInSeconds: 30,
          }),
        );
        return;
      }
      if (request.url === "/api/pairing/poll") {
        response.end(
          JSON.stringify({
            status: "active",
            deviceToken: "dashboard_disconnect_device_token_long_enough",
            protocol: {
              version: 2,
              snapshotDays: 31,
              maximumSources: 32,
              maximumEntries: 1_024,
            },
            sources: [activeMapping],
          }),
        );
        return;
      }
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const home = await mkdtemp(join(tmpdir(), "viberacing-dashboard-disconnect-reconnect-"));
  context.after(() => rm(home, { recursive: true }));
  const directory = join(home, ".viberacing");
  const capture = join(directory, "captures", `${activeClientSourceId}.jsonl`);
  const hookRoot = join(home, ".claude");
  await mkdir(join(directory, "captures"), { recursive: true });
  await mkdir(hookRoot, { recursive: true });
  await writeFile(capture, "");
  await writeLocalSources(directory, [
    {
      clientSourceId: retiredClientSourceId,
      agentId: "claude_code",
      dataPath: join(hookRoot, "projects"),
      hookConfigRoot: hookRoot,
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Unavailable",
    },
    {
      clientSourceId: activeClientSourceId,
      agentId: "antigravity",
      dataPath: capture,
      collectionMethod: "antigravity_cli_capture",
      supportedSurface: "cli",
      suggestedLabel: "Available",
    },
  ]);
  await writeFile(
    join(directory, "installation.json"),
    `${JSON.stringify({
      version: 1,
      id: installationId,
      secret: "dashboard_disconnect_installation_secret_long_enough",
    })}\n`,
  );
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin,
      installationId,
      deviceToken: "dashboard_disconnect_previous_token_long_enough",
      sources: [retiredMapping, activeMapping],
      protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
    })}\n`,
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [retiredSourceId]: "2", [activeSourceId]: "3" },
    })}\n`,
  );
  await writeFile(
    join(hookRoot, "settings.json"),
    `${JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ command: "keep-foreign" }] },
          {
            hooks: [
              {
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${retiredClientSourceId}`,
              },
            ],
          },
        ],
      },
    })}\n`,
  );
  const configBefore = await readFile(join(directory, "config.json"));
  const hookBefore = await readFile(join(hookRoot, "settings.json"));
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    PATH: "",
    VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
  });

  const pending = join(directory, "pending");
  await mkdir(pending, { recursive: true });
  await writeFile(join(pending, `${activeSourceId}.json`), '{"stale":true}\n');
  mode = "unauthorized";
  const reconnected = await execFileAsync(
    process.execPath,
    [connectorPath, "connect", "--origin", origin],
    { env: environment },
  );
  assert.match(
    reconnected.stdout,
    /reconnect|pairing|authorization/i,
  );
  assert.equal(pairingStarts, 1);
  await assert.rejects(access(join(pending, `${activeSourceId}.json`)));
  const reconnectedConfig = JSON.parse(await readFile(join(directory, "config.json"), "utf8"));
  assert.equal(reconnectedConfig.installationId, installationId);
  assert.equal(reconnectedConfig.deviceToken, "dashboard_disconnect_device_token_long_enough");
});

test("independent revoked-403", async (context) => {
  let mode = "malformed";
  let pairingStarts = 0;
  let pairingBody;
  const installationId = "74747474-7474-4474-8474-747474747474";
  const retiredClientSourceId = "75757575-7575-4575-8575-757575757575";
  const activeClientSourceId = "76767676-7676-4676-8676-767676767676";
  const retiredSourceId = "77777777-7777-4777-8777-777777777777";
  const activeSourceId = "78787878-7878-4878-8878-787878787878";
  const activeMapping = {
    clientSourceId: activeClientSourceId,
    sourceId: activeSourceId,
    agentAccountId: "79797979-7979-4979-8979-797979797979",
    agentId: "antigravity",
    accountLabel: "Available",
    collectionMethod: "antigravity_cli_capture",
    lastAcceptedSyncSequence: "3",
  };
  const retiredMapping = {
    clientSourceId: retiredClientSourceId,
    sourceId: retiredSourceId,
    agentAccountId: "80808080-8080-4080-8080-808080808080",
    agentId: "claude_code",
    accountLabel: "Unavailable",
    collectionMethod: "claude_jsonl",
    lastAcceptedSyncSequence: "2",
  };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/installations/current") {
        if (mode === "malformed") {
          response.end(JSON.stringify(reconciliationResponse([activeMapping])));
          return;
        }
        if (mode === "transient") {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "server_error" }));
          return;
        }
        if (mode === "unauthorized") {
          response.statusCode = 403;
          response.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        response.end(
          JSON.stringify(
            reconciliationResponse([
              { ...retiredMapping, status: "disconnected" },
              { ...activeMapping, status: "active" },
            ]),
          ),
        );
        return;
      }
      if (request.url === "/api/pairing/start") {
        pairingStarts += 1;
        pairingBody = body;
        response.statusCode = 201;
        response.end(
          JSON.stringify({
            installationId,
            code: "ABCDEFGH",
            pollToken: "dashboard_disconnect_poll_token_long_enough",
            verificationUrl: `http://${request.headers.host}/connect?code=ABCDEFGH`,
            expiresInSeconds: 30,
          }),
        );
        return;
      }
      if (request.url === "/api/pairing/poll") {
        response.end(
          JSON.stringify({
            status: "active",
            deviceToken: "dashboard_disconnect_device_token_long_enough",
            protocol: {
              version: 2,
              snapshotDays: 31,
              maximumSources: 32,
              maximumEntries: 1_024,
            },
            sources: [activeMapping],
          }),
        );
        return;
      }
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const home = await mkdtemp(join(tmpdir(), "viberacing-dashboard-disconnect-reconnect-"));
  context.after(() => rm(home, { recursive: true }));
  const directory = join(home, ".viberacing");
  const capture = join(directory, "captures", `${activeClientSourceId}.jsonl`);
  const hookRoot = join(home, ".claude");
  await mkdir(join(directory, "captures"), { recursive: true });
  await mkdir(hookRoot, { recursive: true });
  await writeFile(capture, "");
  await writeLocalSources(directory, [
    {
      clientSourceId: retiredClientSourceId,
      agentId: "claude_code",
      dataPath: join(hookRoot, "projects"),
      hookConfigRoot: hookRoot,
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Unavailable",
    },
    {
      clientSourceId: activeClientSourceId,
      agentId: "antigravity",
      dataPath: capture,
      collectionMethod: "antigravity_cli_capture",
      supportedSurface: "cli",
      suggestedLabel: "Available",
    },
  ]);
  await writeFile(
    join(directory, "installation.json"),
    `${JSON.stringify({
      version: 1,
      id: installationId,
      secret: "dashboard_disconnect_installation_secret_long_enough",
    })}\n`,
  );
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin,
      installationId,
      deviceToken: "dashboard_disconnect_previous_token_long_enough",
      sources: [retiredMapping, activeMapping],
      protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
    })}\n`,
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [retiredSourceId]: "2", [activeSourceId]: "3" },
    })}\n`,
  );
  await writeFile(
    join(hookRoot, "settings.json"),
    `${JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ command: "keep-foreign" }] },
          {
            hooks: [
              {
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${retiredClientSourceId}`,
              },
            ],
          },
        ],
      },
    })}\n`,
  );
  const configBefore = await readFile(join(directory, "config.json"));
  const hookBefore = await readFile(join(hookRoot, "settings.json"));
  const environment = connectorEnvironment(home, {
    NODE_ENV: "test",
    PATH: "",
    VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
  });

  const pending = join(directory, "pending");
  await mkdir(pending, { recursive: true });
  await writeFile(join(pending, `${activeSourceId}.json`), '{"stale":true}\n');
  mode = "unauthorized";
  const reconnected = await execFileAsync(
    process.execPath,
    [connectorPath, "connect", "--origin", origin],
    { env: environment },
  );
  assert.match(
    reconnected.stdout,
    /reconnect|pairing|authorization/i,
  );
  assert.equal(pairingStarts, 1);
  await assert.rejects(access(join(pending, `${activeSourceId}.json`)));
  const reconnectedConfig = JSON.parse(await readFile(join(directory, "config.json"), "utf8"));
  assert.equal(reconnectedConfig.installationId, installationId);
  assert.equal(reconnectedConfig.deviceToken, "dashboard_disconnect_device_token_long_enough");
});

test("independent required authorization removal failure aborts pairing", async (context) => {
  let mode = "malformed";
  let pairingStarts = 0;
  let pairingBody;
  const installationId = "74747474-7474-4474-8474-747474747474";
  const retiredClientSourceId = "75757575-7575-4575-8575-757575757575";
  const activeClientSourceId = "76767676-7676-4676-8676-767676767676";
  const retiredSourceId = "77777777-7777-4777-8777-777777777777";
  const activeSourceId = "78787878-7878-4878-8878-787878787878";
  const activeMapping = {
    clientSourceId: activeClientSourceId,
    sourceId: activeSourceId,
    agentAccountId: "79797979-7979-4979-8979-797979797979",
    agentId: "antigravity",
    accountLabel: "Available",
    collectionMethod: "antigravity_cli_capture",
    lastAcceptedSyncSequence: "3",
  };
  const retiredMapping = {
    clientSourceId: retiredClientSourceId,
    sourceId: retiredSourceId,
    agentAccountId: "80808080-8080-4080-8080-808080808080",
    agentId: "claude_code",
    accountLabel: "Unavailable",
    collectionMethod: "claude_jsonl",
    lastAcceptedSyncSequence: "2",
  };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/installations/current") {
        if (mode === "malformed") {
          response.end(JSON.stringify(reconciliationResponse([activeMapping])));
          return;
        }
        if (mode === "transient") {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "server_error" }));
          return;
        }
        if (mode === "unauthorized") {
          response.statusCode = 401;
          response.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        response.end(
          JSON.stringify(
            reconciliationResponse([
              { ...retiredMapping, status: "disconnected" },
              { ...activeMapping, status: "active" },
            ]),
          ),
        );
        return;
      }
      if (request.url === "/api/pairing/start") {
        pairingStarts += 1;
        pairingBody = body;
        response.statusCode = 201;
        response.end(
          JSON.stringify({
            installationId,
            code: "ABCDEFGH",
            pollToken: "dashboard_disconnect_poll_token_long_enough",
            verificationUrl: `http://${request.headers.host}/connect?code=ABCDEFGH`,
            expiresInSeconds: 30,
          }),
        );
        return;
      }
      if (request.url === "/api/pairing/poll") {
        response.end(
          JSON.stringify({
            status: "active",
            deviceToken: "dashboard_disconnect_device_token_long_enough",
            protocol: {
              version: 2,
              snapshotDays: 31,
              maximumSources: 32,
              maximumEntries: 1_024,
            },
            sources: [activeMapping],
          }),
        );
        return;
      }
      response.end(JSON.stringify(usageResponse(body)));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const home = await mkdtemp(join(tmpdir(), "viberacing-dashboard-disconnect-reconnect-"));
  context.after(() => rm(home, { recursive: true }));
  const directory = join(home, ".viberacing");
  const capture = join(directory, "captures", `${activeClientSourceId}.jsonl`);
  const hookRoot = join(home, ".claude");
  await mkdir(join(directory, "captures"), { recursive: true });
  await mkdir(hookRoot, { recursive: true });
  await writeFile(capture, "");
  await writeLocalSources(directory, [
    {
      clientSourceId: retiredClientSourceId,
      agentId: "claude_code",
      dataPath: join(hookRoot, "projects"),
      hookConfigRoot: hookRoot,
      collectionMethod: "claude_jsonl",
      supportedSurface: "cli",
      suggestedLabel: "Unavailable",
    },
    {
      clientSourceId: activeClientSourceId,
      agentId: "antigravity",
      dataPath: capture,
      collectionMethod: "antigravity_cli_capture",
      supportedSurface: "cli",
      suggestedLabel: "Available",
    },
  ]);
  await writeFile(
    join(directory, "installation.json"),
    `${JSON.stringify({
      version: 1,
      id: installationId,
      secret: "dashboard_disconnect_installation_secret_long_enough",
    })}\n`,
  );
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify({
      version: 2,
      origin,
      installationId,
      deviceToken: "dashboard_disconnect_previous_token_long_enough",
      sources: [retiredMapping, activeMapping],
      protocol: { version: 2, snapshotDays: 31, maximumSources: 32, maximumEntries: 1_024 },
    })}\n`,
  );
  await writeFile(
    join(directory, "state.json"),
    `${JSON.stringify({
      version: 1,
      sequences: { [retiredSourceId]: "2", [activeSourceId]: "3" },
    })}\n`,
  );
  await writeFile(
    join(hookRoot, "settings.json"),
    `${JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ command: "keep-foreign" }] },
          {
            hooks: [
              {
                command: `node hook --viberacing-hook-id=viberacing-hook-v3:${retiredClientSourceId}`,
              },
            ],
          },
        ],
      },
    })}\n`,
  );
  const configBefore = await readFile(join(directory, "config.json"));
  const hookBefore = await readFile(join(hookRoot, "settings.json"));
  const fault = join(home, "remove-config-fault.mjs");
  await writeFile(fault, `import fs from 'node:fs';import promises from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';const old=promises.unlink;promises.unlink=async function(p,...args){if(String(p).endsWith('/.viberacing/config.json'))throw Object.assign(new Error('Injected required authorization removal failure'),{code:'EACCES'});return old.call(this,p,...args)};syncBuiltinESMExports();`);
  const environment = connectorEnvironment(home, {
    NODE_OPTIONS: '--import='+fault,
    NODE_ENV: "test",
    PATH: "",
    VIBERACING_TEST_PAIRING_POLL_INTERVAL_MS: "10",
  });

  mode = "unauthorized";
  await assert.rejects(execFileAsync(process.execPath,[connectorPath,"connect","--origin",origin],{env:environment}), /Injected required authorization removal failure/);
  assert.equal(pairingStarts,0);
  assert.deepEqual(await readFile(join(directory,"config.json")),configBefore);
});
