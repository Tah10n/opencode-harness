import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runSyntheticCliMain } from "../lib/benchmark/cli.mjs";

const root = fs.realpathSync.native(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.exitCode = await runSyntheticCliMain({ command: "selfTest", sourceRoot: root });
