import { createHash } from "node:crypto";

import { canonicalJson } from "../feedback/contracts.mjs";

function expect(condition, message) {
  if (!condition) throw new Error(`BENCHMARK_V3_OPERATOR_IMAGE: ${message}`);
}

export function benchmarkV3OperatorImageIdentity(inspectValue) {
  const image = Array.isArray(inspectValue) ? inspectValue[0] : inspectValue;
  expect(image && typeof image === "object" && (!Array.isArray(inspectValue) || inspectValue.length === 1),
    "docker inspect must contain exactly one image");
  expect(typeof image.Architecture === "string" && image.Architecture.length > 0,
    "image architecture is unavailable");
  expect(typeof image.Os === "string" && image.Os.length > 0, "image operating system is unavailable");
  expect(image.RootFS && typeof image.RootFS === "object" && Array.isArray(image.RootFS.Layers)
    && image.RootFS.Layers.length > 0
    && image.RootFS.Layers.every((layer) => /^sha256:[0-9a-f]{64}$/u.test(layer)),
  "image root filesystem identity is invalid");
  expect(image.Config && typeof image.Config === "object" && !Array.isArray(image.Config),
    "image runtime configuration is unavailable");
  const config = image.Config;
  const identity = {
    schema_version: 1,
    architecture: image.Architecture,
    os: image.Os,
    variant: image.Variant ?? null,
    rootfs: { type: image.RootFS.Type, layers: image.RootFS.Layers },
    config: {
      user: config.User ?? "",
      env: config.Env ?? [],
      entrypoint: config.Entrypoint ?? [],
      cmd: config.Cmd ?? [],
      working_directory: config.WorkingDir ?? "",
      labels: config.Labels ?? {},
      volumes: config.Volumes ?? {},
      exposed_ports: config.ExposedPorts ?? {},
      healthcheck: config.Healthcheck ?? null,
      stop_signal: config.StopSignal ?? "",
      stop_timeout: config.StopTimeout ?? null,
      shell: config.Shell ?? [],
      on_build: config.OnBuild ?? [],
      network_disabled: config.NetworkDisabled ?? false,
      args_escaped: config.ArgsEscaped ?? false,
    },
  };
  return Object.freeze({ architecture: image.Architecture,
    runtime_fingerprint: `sha256:${createHash("sha256").update(canonicalJson(identity)).digest("hex")}` });
}
