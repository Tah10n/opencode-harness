import fs from "node:fs";
import path from "node:path";

export function parseBenchmarkV3OperatorArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (typeof name !== "string" || !name.startsWith("--") || name.length < 3 || typeof value !== "string") {
      throw new Error("operator arguments must be --name value pairs");
    }
    if (values.has(name.slice(2))) throw new Error(`duplicate operator argument: ${name}`);
    values.set(name.slice(2), value);
  }
  return values;
}

export function requiredOperatorArgument(values, name) {
  const value = values.get(name);
  if (typeof value !== "string" || value.length === 0) throw new Error(`--${name} is required`);
  return value;
}

export function absoluteOperatorArgument(values, name) {
  const value = requiredOperatorArgument(values, name);
  if (!path.isAbsolute(value)) throw new Error(`--${name} must be absolute`);
  return path.resolve(value);
}

export function writeOperatorJsonExclusive(file, value, mode = 0o600) {
  const descriptor = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, mode);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
}

export function printOperatorResult(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
