#!/usr/bin/env node
import path from "node:path";

import { initializeBenchmarkV3ReviewerCustody } from "../lib/benchmark/v3-operator-custody.mjs";
import { absoluteOperatorArgument, parseBenchmarkV3OperatorArguments, printOperatorResult,
  requiredOperatorArgument, writeOperatorJsonExclusive } from "../lib/benchmark/v3-operator-cli.mjs";

const values = parseBenchmarkV3OperatorArguments(process.argv.slice(2));
const sourceRoot = path.resolve(values.get("source-root") ?? process.cwd());
const custodyRoot = absoluteOperatorArgument(values, "custody-root");
const reviewer = requiredOperatorArgument(values, "reviewer");
const registryOutput = absoluteOperatorArgument(values, "registry-output");
const result = initializeBenchmarkV3ReviewerCustody({ sourceRoot, custodyRoot, reviewer, ownerUid: 0 });
writeOperatorJsonExclusive(registryOutput, result.registry_bundle);
printOperatorResult({ schema_version: 1, status: result.status, reviewer,
  custody_root_fingerprint: result.custody_root_fingerprint, roles: result.roles,
  inventory_fingerprint: result.inventory_fingerprint, registry_output: registryOutput,
  private_key_material_emitted: false });
