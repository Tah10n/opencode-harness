#!/usr/bin/env node
import path from "node:path";

import { signBenchmarkV3ReviewEvidence } from "../lib/benchmark/v3-operator-issue.mjs";
import { absoluteOperatorArgument, parseBenchmarkV3OperatorArguments, printOperatorResult,
  requiredOperatorArgument } from "../lib/benchmark/v3-operator-cli.mjs";

const values = parseBenchmarkV3OperatorArguments(process.argv.slice(2));
printOperatorResult(signBenchmarkV3ReviewEvidence({
  sourceRoot: path.resolve(values.get("source-root") ?? process.cwd()),
  custodyRoot: absoluteOperatorArgument(values, "custody-root"), reviewer: requiredOperatorArgument(values, "reviewer"),
  resultPath: absoluteOperatorArgument(values, "result"), evidencePath: absoluteOperatorArgument(values, "evidence"),
  outputPath: absoluteOperatorArgument(values, "output"), ownerUid: 0,
}));
