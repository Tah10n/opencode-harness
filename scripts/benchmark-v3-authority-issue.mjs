#!/usr/bin/env node
import path from "node:path";

import { issueBenchmarkV3ExecutionAuthority } from "../lib/benchmark/v3-operator-issue.mjs";
import { absoluteOperatorArgument, parseBenchmarkV3OperatorArguments, printOperatorResult } from "../lib/benchmark/v3-operator-cli.mjs";

const values = parseBenchmarkV3OperatorArguments(process.argv.slice(2));
printOperatorResult(issueBenchmarkV3ExecutionAuthority({
  sourceRoot: path.resolve(values.get("source-root") ?? process.cwd()),
  custodyRoot: absoluteOperatorArgument(values, "custody-root"),
  outputDirectory: absoluteOperatorArgument(values, "output"),
  receiptPath: absoluteOperatorArgument(values, "receipt"), ownerUid: 0,
}));
