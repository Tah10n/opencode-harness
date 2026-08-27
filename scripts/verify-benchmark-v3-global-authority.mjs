#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canonicalJson, fingerprint } from "../lib/feedback/contracts.mjs";
import { benchmarkV3ExecutionCloneBinding, consumeBenchmarkV3Execution,
  inspectBenchmarkV3HoldoutExecutionAuthority, loadSignedBenchmarkV3ExecutionAuthority,
  reserveBenchmarkV3Continuation, reserveBenchmarkV3Execution } from "../lib/benchmark/v3-execution-authority.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v3-global-authority-"));
try {
  const cloneOne = path.join(temporary, "clone-one");
  const cloneTwo = path.join(temporary, "clone-two");
  for (const clone of [cloneOne, cloneTwo]) {
    const result = spawnSync("git", ["clone", "--quiet", "--no-hardlinks", root, clone], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  const channel = path.join(temporary, "authority-channel");
  const registryRoot = path.join(temporary, "external-registry");
  fs.mkdirSync(channel, { mode: 0o700 });
  fs.mkdirSync(registryRoot, { mode: 0o700 });
  const registryPath = path.join(registryRoot, "registry.jsonl");
  const output = path.join(temporary, "campaign-output");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const issuer = { issuer_id: "fixture-global-execution-authority-v1", protected_channel: "fixture-authority-channel-v1",
    channel_root: channel, registry_root: registryRoot, registry_path: registryPath, owner_uid: process.getuid(),
    public_key_pem: publicKey.export({ type: "spki", format: "pem" }) };
  const sourceSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: cloneOne, encoding: "utf8" }).stdout.trim();
  const sourceTreeFingerprint = `sha256:${"1".repeat(64)}`;
  const designFingerprint = `sha256:${"2".repeat(64)}`;
  const corpusFingerprint = `sha256:${"3".repeat(64)}`;
  const body = { schema_version: 1, issuer_id: issuer.issuer_id, protected_channel: issuer.protected_channel,
    campaign_execution_id: "campaign-global-one-shot-0001", holdout_execution_id: "holdout-global-one-shot-0001",
    source_sha: sourceSha, source_tree_fingerprint: sourceTreeFingerprint, design_fingerprint: designFingerprint,
    corpus_fingerprint: corpusFingerprint, output_directory_fingerprint: fingerprint(path.resolve(output)),
    issued_at_ms: Date.now() - 100, expires_at_ms: Date.now() + 60_000 };
  const receiptPath = path.join(channel, "authority.json");
  fs.writeFileSync(receiptPath, JSON.stringify({ ...body,
    signature: sign(null, Buffer.from(canonicalJson(body), "utf8"), privateKey).toString("base64url") }), { mode: 0o600 });
  const authority = loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: cloneOne, receiptPath, sourceSha,
    sourceTreeFingerprint, designFingerprint, corpusFingerprint, outputDirectory: output, trustedIssuers: [issuer] });
  const campaignFingerprint = `sha256:${"c".repeat(64)}`;
  const cloneOneBinding = benchmarkV3ExecutionCloneBinding(cloneOne, output, { host: "host-one" });
  const first = reserveBenchmarkV3Execution({ authority, phase: "campaign", campaignFingerprint, cloneBinding: cloneOneBinding });
  assert.equal(first.disposition, "reserved");
  assert.throws(() => inspectBenchmarkV3HoldoutExecutionAuthority({ authority, campaignFingerprint,
    cloneBinding: cloneOneBinding }), /not durably consumed/u);
  assert.throws(() => reserveBenchmarkV3Execution({ authority, phase: "holdout", campaignFingerprint,
    cloneBinding: cloneOneBinding }), /durably consumed/u,
  "the actual holdout reservation must reject an incompletely consumed campaign");
  assert.equal(reserveBenchmarkV3Execution({ authority, phase: "campaign", campaignFingerprint,
    cloneBinding: cloneOneBinding }).disposition, "exact-resume");
  assert.equal(reserveBenchmarkV3Continuation({ authority, phase: "campaign", mode: "resume", campaignFingerprint,
    cloneBinding: cloneOneBinding }).disposition, "reserved");
  assert.throws(() => reserveBenchmarkV3Continuation({ authority, phase: "campaign", mode: "retry", campaignFingerprint,
    cloneBinding: cloneOneBinding }), /continuation/u, "resume and retry must share one durable campaign-wide allowance");
  const cloneTwoBinding = benchmarkV3ExecutionCloneBinding(cloneTwo, output, { host: "host-one" });
  assert.throws(() => reserveBenchmarkV3Execution({ authority, phase: "campaign", campaignFingerprint,
    cloneBinding: cloneTwoBinding }), /another clone or binding/u,
  "a second independent clone must be rejected before model execution");
  const crossHostBinding = benchmarkV3ExecutionCloneBinding(cloneOne, output, { host: "host-two" });
  assert.throws(() => reserveBenchmarkV3Execution({ authority, phase: "campaign", campaignFingerprint,
    cloneBinding: crossHostBinding }), /another clone or binding/u,
  "a cross-host replay of the same execution ID must be rejected");
  assert.equal(consumeBenchmarkV3Execution({ authority, phase: "campaign", campaignFingerprint,
    cloneBinding: cloneOneBinding }).disposition, "consumed");
  assert.equal(inspectBenchmarkV3HoldoutExecutionAuthority({ authority, campaignFingerprint,
    cloneBinding: cloneOneBinding }).holdout_status, "available");
  assert.throws(() => inspectBenchmarkV3HoldoutExecutionAuthority({ authority: {
    ...authority, authority_fingerprint: `sha256:${"f".repeat(64)}` }, campaignFingerprint,
  cloneBinding: cloneOneBinding }), /another clone or binding/u,
  "readiness inspection must reject an authority rebound over the consumed campaign ID");
  assert.equal(reserveBenchmarkV3Execution({ authority, phase: "campaign", campaignFingerprint,
    cloneBinding: cloneOneBinding }).disposition, "exact-consumed-resume");
  assert.throws(() => reserveBenchmarkV3Execution({ authority, phase: "campaign", campaignFingerprint,
    cloneBinding: cloneTwoBinding }), /another clone or binding/u);
  assert.equal(reserveBenchmarkV3Execution({ authority, phase: "holdout", campaignFingerprint,
    cloneBinding: cloneOneBinding }).disposition, "reserved");
  assert.throws(() => reserveBenchmarkV3Continuation({ authority, phase: "holdout", mode: "retry", campaignFingerprint,
    cloneBinding: cloneOneBinding }), /campaign-wide/u, "a campaign resume must also consume the holdout retry allowance");
  assert.equal(inspectBenchmarkV3HoldoutExecutionAuthority({ authority, campaignFingerprint,
    cloneBinding: cloneOneBinding }).holdout_status, "exact-resume");
  assert.equal(consumeBenchmarkV3Execution({ authority, phase: "holdout", campaignFingerprint,
    cloneBinding: cloneOneBinding }).disposition, "consumed");
  assert.throws(() => inspectBenchmarkV3HoldoutExecutionAuthority({ authority, campaignFingerprint,
    cloneBinding: cloneOneBinding }), /already globally consumed/u);
  const retryBody = { ...body, campaign_execution_id: "campaign-global-one-shot-0002",
    holdout_execution_id: "holdout-global-one-shot-0002" };
  fs.writeFileSync(receiptPath, JSON.stringify({ ...retryBody,
    signature: sign(null, Buffer.from(canonicalJson(retryBody), "utf8"), privateKey).toString("base64url") }), { mode: 0o600 });
  const retryAuthority = loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: cloneOne, receiptPath, sourceSha,
    sourceTreeFingerprint, designFingerprint, corpusFingerprint, outputDirectory: output, trustedIssuers: [issuer] });
  const retryCampaignFingerprint = `sha256:${"d".repeat(64)}`;
  reserveBenchmarkV3Execution({ authority: retryAuthority, phase: "campaign",
    campaignFingerprint: retryCampaignFingerprint, cloneBinding: cloneOneBinding });
  reserveBenchmarkV3Continuation({ authority: retryAuthority, phase: "campaign", mode: "retry",
    campaignFingerprint: retryCampaignFingerprint, cloneBinding: cloneOneBinding });
  assert.throws(() => reserveBenchmarkV3Continuation({ authority: retryAuthority, phase: "campaign", mode: "resume",
    campaignFingerprint: retryCampaignFingerprint, cloneBinding: cloneOneBinding }), /continuation/u);
  consumeBenchmarkV3Execution({ authority: retryAuthority, phase: "campaign",
    campaignFingerprint: retryCampaignFingerprint, cloneBinding: cloneOneBinding });
  const expiredBody = { ...body, issued_at_ms: Date.now() - 20_000, expires_at_ms: Date.now() - 10_000 };
  fs.writeFileSync(receiptPath, JSON.stringify({ ...expiredBody,
    signature: sign(null, Buffer.from(canonicalJson(expiredBody), "utf8"), privateKey).toString("base64url") }), { mode: 0o600 });
  assert.throws(() => loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: cloneOne, receiptPath, sourceSha,
    sourceTreeFingerprint, designFingerprint, corpusFingerprint, outputDirectory: output, trustedIssuers: [issuer] }),
  /expiry is invalid/u, "an expired unused authority must fail before reservation");
  const events = fs.readFileSync(registryPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(events.map((entry) => [entry.execution_id, entry.action]), [
    [body.campaign_execution_id, "reserve"], [body.campaign_execution_id, "continuation"], [body.campaign_execution_id, "consume"],
    [body.holdout_execution_id, "reserve"], [body.holdout_execution_id, "consume"],
    [retryBody.campaign_execution_id, "reserve"], [retryBody.campaign_execution_id, "continuation"],
    [retryBody.campaign_execution_id, "consume"],
  ]);
  assert.equal(events.every((entry, index) => entry.sequence === index + 1
    && entry.prior_event_fingerprint === (events[index - 1]?.event_fingerprint ?? null)), true);
  process.stdout.write(`${JSON.stringify({ schema_version: 1, status: "passed", gate: "benchmark-v3-global-execution-authority",
    model_calls: 0, independent_clones: 2, exact_resume_allowed: true, campaign_wide_continuation_limit: 1,
    second_clone_rejected: true,
    cross_host_rejected: true, incomplete_campaign_holdout_rejected: true,
    authority_rebound_rejected: true, expired_authority_rejected: true,
    registry_readiness_inspected: true,
    append_only_events: events.length }, null, 2)}\n`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
