#!/usr/bin/env node
import path from "node:path";

import { issueBenchmarkV3ReadinessReceipts } from "../lib/benchmark/v3-operator-issue.mjs";
import { runBenchmarkV3OperatorProbes,
  runBenchmarkV3ProviderOnlyEgressProbe } from "../lib/benchmark/v3-operator-probes.mjs";
import { absoluteOperatorArgument, parseBenchmarkV3OperatorArguments, printOperatorResult } from "../lib/benchmark/v3-operator-cli.mjs";

const values = parseBenchmarkV3OperatorArguments(process.argv.slice(2));
const sourceRoot = path.resolve(values.get("source-root") ?? process.cwd());
const probeEvidence = await runBenchmarkV3OperatorProbes({ sourceRoot,
  opencodeExecutable: absoluteOperatorArgument(values, "opencode") });
const egressReceiptPath = values.has("egress-receipt") ? absoluteOperatorArgument(values, "egress-receipt") : null;
const egressProbeEvidence = egressReceiptPath === null ? null : runBenchmarkV3ProviderOnlyEgressProbe({ sourceRoot });
const receipts = issueBenchmarkV3ReadinessReceipts({ sourceRoot,
  custodyRoot: absoluteOperatorArgument(values, "custody-root"), probeEvidence,
  processReceiptPath: absoluteOperatorArgument(values, "process-receipt"),
  namespaceReceiptPath: absoluteOperatorArgument(values, "namespace-receipt"),
  egressProbeEvidence, egressReceiptPath, ownerUid: 0 });
printOperatorResult({ schema_version: 1, status: "verified-and-issued", probe_fingerprint: probeEvidence.probe_fingerprint,
  opencode_executable_fingerprint: probeEvidence.opencode_executable_fingerprint, receipts });
