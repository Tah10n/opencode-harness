#!/bin/sh
set -eu

action="${1:-}"
if [ -z "$action" ]; then
  echo "usage: operator-container.sh build | run <command...>" >&2
  exit 64
fi
shift

image="${BENCHMARK_V3_OPERATOR_IMAGE:-opencode-harness-benchmark-v3-operator:1.0.0}"
source_root="${BENCHMARK_V3_SOURCE_ROOT:-$(pwd -P)}"
campaign_root="${BENCHMARK_V3_CAMPAIGN_ROOT:-}"
custody_volume="${BENCHMARK_V3_CUSTODY_VOLUME:-opencode-harness-benchmark-v3-authority-v2}"
channel_volume="${BENCHMARK_V3_CHANNEL_VOLUME:-opencode-harness-benchmark-v3-channels}"
external_bundle="${BENCHMARK_V3_PROVENANCE_BUNDLE:-}"
external_runtime="${BENCHMARK_V3_SEMANTIC_RUNTIME_ROOT:-}"
oauth_state_file="${BENCHMARK_V3_OPENAI_OAUTH_FILE:-}"
provider_auth_mode="${BENCHMARK_V3_PROVIDER_AUTH_MODE:-api}"

case "$action" in
  build)
    canonical_source="$(cd "$source_root" && pwd -P)"
    if [ -n "$(git -C "$canonical_source" status --porcelain=v1 --untracked-files=all)" ]; then
      echo "operator image requires an exact clean source tree" >&2
      exit 78
    fi
    exec docker build --provenance=false --file "$canonical_source/ops/benchmark-v3/Dockerfile" \
      --tag "$image" "$canonical_source"
    ;;
  run)
    if [ -z "$campaign_root" ] || [ ! -d "$campaign_root" ]; then
      echo "BENCHMARK_V3_CAMPAIGN_ROOT must name an existing external directory" >&2
      exit 65
    fi
    canonical_source="$(cd "$source_root" && pwd -P)"
    canonical_campaign="$(cd "$campaign_root" && pwd -P)"
    if [ "$source_root" != "$canonical_source" ] || [ "$campaign_root" != "$canonical_campaign" ]; then
      echo "operator source and campaign roots must be canonical absolute directories" >&2
      exit 67
    fi
    if [ "${1:-}" != "npm" ] || [ "${2:-}" != "run" ] || [ -z "${3:-}" ]; then
      echo "operator run accepts only an allowlisted npm script" >&2
      exit 70
    fi
    script="$3"
    reviewed=1
    privileged=0
    provider_only=1
    entrypoint=""
    case "$script" in
      bench:v3:authority:init) entrypoint="scripts/benchmark-v3-authority-init.mjs" ;;
      bench:v3:authority:issue) entrypoint="scripts/benchmark-v3-authority-issue.mjs" ;;
      bench:v3:review:issue) entrypoint="scripts/benchmark-v3-review-issue.mjs" ;;
      bench:v3:operator:verify) privileged=1; entrypoint="scripts/benchmark-v3-operator-verify.mjs" ;;
      bench:v3:readiness:issue) privileged=1; provider_only=1; entrypoint="scripts/benchmark-v3-readiness-issue.mjs" ;;
      bench:v3:holdout:commit) privileged=1; entrypoint="scripts/benchmark-v3-holdout-commit.mjs" ;;
      bench:v3:holdout:materialize) privileged=1; entrypoint="scripts/benchmark-v3-holdout-materialize.mjs" ;;
      verify:development-readiness) privileged=1; entrypoint="scripts/verify-benchmark-v3-development-readiness.mjs" ;;
      verify:holdout-readiness) privileged=1; provider_only=1; entrypoint="scripts/verify-benchmark-v3-holdout-readiness.mjs" ;;
      bench:v3) privileged=1; entrypoint="scripts/benchmark-v3-run.mjs" ;;
      bench:v3:holdout) privileged=1; provider_only=1; entrypoint="scripts/benchmark-v3-holdout.mjs" ;;
      bench:v3:takeover) privileged=1; entrypoint="scripts/benchmark-v3-takeover.mjs" ;;
      *) echo "operator npm script is not allowlisted: $script" >&2; exit 71 ;;
    esac
    if [ "$reviewed" -eq 1 ]; then
      reviewed_sha="${BENCHMARK_V3_REVIEWED_SOURCE_SHA:-}"
      case "$reviewed_sha" in
        ''|*[!0-9a-f]*) echo "BENCHMARK_V3_REVIEWED_SOURCE_SHA is required" >&2; exit 72 ;;
      esac
      if [ "${#reviewed_sha}" -ne 40 ] || [ "$(git -C "$source_root" rev-parse HEAD)" != "$reviewed_sha" ] \
        || [ -n "$(git -C "$source_root" status --porcelain=v1 --untracked-files=all)" ]; then
        echo "operator source is not the exact clean independently reviewed SHA" >&2
        exit 73
      fi
    fi
    image_id="$(docker image inspect --format '{{.Id}}' "$image")"
    image_identity="$(docker image inspect "$image" | node "$source_root/scripts/benchmark-v3-image-fingerprint.mjs")"
    image_arch="${image_identity%% *}"
    image_fingerprint="${image_identity#* }"
    expected_image_fingerprint="$(node -e 'const fs=require("fs");const [f,a]=process.argv.slice(1);const v=JSON.parse(fs.readFileSync(f));process.stdout.write(v.images[a]?.runtime_fingerprint||"")' \
      "$source_root/benchmarks/v3/operator-image.v1.json" "$image_arch")"
    if [ "$image_fingerprint" != "$expected_image_fingerprint" ]; then
      echo "operator image does not match the committed immutable runtime fingerprint" >&2
      exit 79
    fi
    case "$provider_auth_mode" in api|oauth) ;; *) echo "BENCHMARK_V3_PROVIDER_AUTH_MODE must be api or oauth" >&2; exit 80 ;; esac
    if [ -n "${BENCHMARK_V3_OPENAI_KEY_FILE:-}" ] && [ -n "$oauth_state_file" ]; then
      echo "API key and OAuth state credentials are mutually exclusive" >&2
      exit 81
    fi
    if [ -n "${BENCHMARK_V3_OPENAI_KEY_FILE:-}" ]; then
      if [ "$script" != "bench:v3" ] && [ "$script" != "bench:v3:holdout" ]; then
        echo "provider authorization is accepted only for a canonical model runner" >&2
        exit 74
      fi
      if [ ! -f "$BENCHMARK_V3_OPENAI_KEY_FILE" ] || [ -L "$BENCHMARK_V3_OPENAI_KEY_FILE" ]; then
        echo "BENCHMARK_V3_OPENAI_KEY_FILE must be a non-symlink regular file" >&2
        exit 68
      fi
      key_mode="$(stat -f '%Lp' "$BENCHMARK_V3_OPENAI_KEY_FILE" 2>/dev/null || stat -c '%a' "$BENCHMARK_V3_OPENAI_KEY_FILE")"
      if [ "$key_mode" != "400" ] && [ "$key_mode" != "600" ]; then
        echo "BENCHMARK_V3_OPENAI_KEY_FILE must have mode 0400 or 0600" >&2
        exit 69
      fi
      if [ "$provider_auth_mode" != "api" ]; then
        echo "API key authorization requires BENCHMARK_V3_PROVIDER_AUTH_MODE=api" >&2
        exit 82
      fi
    fi
    if [ -n "$oauth_state_file" ]; then
      if [ "$script" != "bench:v3" ] && [ "$script" != "bench:v3:holdout" ]; then
        echo "provider authorization is accepted only for a canonical model runner" >&2
        exit 74
      fi
      if [ ! -f "$oauth_state_file" ] || [ -L "$oauth_state_file" ]; then
        echo "BENCHMARK_V3_OPENAI_OAUTH_FILE must be a non-symlink regular file" >&2
        exit 83
      fi
      oauth_parent="$(cd "$(dirname "$oauth_state_file")" && pwd -P)"
      if [ "$oauth_parent/$(basename "$oauth_state_file")" != "$oauth_state_file" ] \
        || [ "$(basename "$oauth_state_file")" != "openai-oauth-state.jsonl" ]; then
        echo "BENCHMARK_V3_OPENAI_OAUTH_FILE must be a canonical absolute path" >&2
        exit 86
      fi
      oauth_parent_mode="$(stat -f '%Lp' "$oauth_parent" 2>/dev/null || stat -c '%a' "$oauth_parent")"
      oauth_parent_uid="$(stat -f '%u' "$oauth_parent" 2>/dev/null || stat -c '%u' "$oauth_parent")"
      if [ "$oauth_parent_mode" != "700" ] || [ "$oauth_parent_uid" != "$(id -u)" ]; then
        echo "BENCHMARK_V3_OPENAI_OAUTH_FILE parent must be private and owner-controlled" >&2
        exit 87
      fi
      oauth_mode="$(stat -f '%Lp' "$oauth_state_file" 2>/dev/null || stat -c '%a' "$oauth_state_file")"
      if [ "$oauth_mode" != "600" ]; then
        echo "BENCHMARK_V3_OPENAI_OAUTH_FILE must have mode 0600" >&2
        exit 84
      fi
      oauth_size="$(stat -f '%z' "$oauth_state_file" 2>/dev/null || stat -c '%s' "$oauth_state_file")"
      if [ "$oauth_size" -lt 1 ] || [ "$oauth_size" -gt 262144 ] || [ "$provider_auth_mode" != "oauth" ]; then
        echo "OAuth state authorization is invalid or not bound to oauth mode" >&2
        exit 85
      fi
    fi
    if [ -n "$external_bundle" ] || [ -n "$external_runtime" ]; then
      if [ -z "$external_bundle" ] || [ -z "$external_runtime" ]; then
        echo "external provenance bundle and semantic runtime must be mounted together" >&2
        exit 75
      fi
      case "$script" in
        bench:v3:operator:verify|bench:v3:holdout:commit|bench:v3:holdout:materialize) ;;
        *) echo "external calibration inputs are not accepted for this operator action" >&2; exit 76 ;;
      esac
      if [ ! -f "$external_bundle" ] || [ -L "$external_bundle" ] || [ ! -d "$external_runtime" ] \
        || [ -L "$external_runtime" ] || [ "$(cd "$(dirname "$external_bundle")" && pwd -P)/$(basename "$external_bundle")" != "$external_bundle" ] \
        || [ "$(cd "$external_runtime" && pwd -P)" != "$external_runtime" ]; then
        echo "external calibration inputs must be canonical non-symlink file and directory paths" >&2
        exit 77
      fi
    fi
    shift 3
    if [ "${1:-}" = "--" ]; then shift; fi
    set -- node "/workspace/source/$entrypoint" "$@"
    if [ "$privileged" -eq 0 ]; then
      exec docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
        --hostname benchmark-v3-authority --read-only \
        --tmpfs /tmp:rw,exec,nosuid,nodev,mode=1777 \
        --tmpfs /usr/local/libexec:rw,exec,nosuid,nodev,mode=0755 \
        --mount "type=bind,src=$source_root,dst=/workspace/source,readonly" \
        --mount "type=bind,src=$campaign_root,dst=/campaign" \
        --mount "type=volume,src=$custody_volume,dst=/var/lib/opencode-harness" \
        --mount "type=volume,src=$channel_volume,dst=/run/opencode-harness" \
        --env BENCHMARK_V3_CGROUP_REQUIRED=0 \
        --env "BENCHMARK_V3_PROVIDER_AUTH_MODE=$provider_auth_mode" \
        --env "BENCHMARK_V3_OPERATOR_IMAGE_ID=$image_fingerprint" \
        "$image_id" "$@"
    fi
    if [ -n "$external_bundle" ]; then
      exec docker run --rm --privileged --cgroupns=host --hostname benchmark-v3-authority --read-only \
        --tmpfs /tmp:rw,exec,nosuid,nodev,mode=1777 \
        --tmpfs /usr/local/libexec:rw,exec,nosuid,nodev,mode=0755 \
        --mount "type=bind,src=$source_root,dst=/workspace/source,readonly" \
        --mount "type=bind,src=$campaign_root,dst=/campaign" \
        --mount "type=bind,src=$external_bundle,dst=/opt/benchmark-v3/provenance.bundle,readonly" \
        --mount "type=bind,src=$external_runtime,dst=/opt/benchmark-v3/semantic-runtime,readonly" \
        --mount "type=volume,src=$custody_volume,dst=/var/lib/opencode-harness" \
        --mount "type=volume,src=$channel_volume,dst=/run/opencode-harness" \
        --env BENCHMARK_V3_CGROUP_REQUIRED=1 \
        --env "BENCHMARK_V3_OPERATOR_IMAGE_ID=$image_fingerprint" \
        --env "BENCHMARK_V3_PROVIDER_ONLY_EGRESS=$provider_only" \
        --env "BENCHMARK_V3_PROVIDER_AUTH_MODE=$provider_auth_mode" \
        "$image_id" "$@"
    fi
    if [ -n "$oauth_state_file" ]; then
      exec docker run --rm --privileged --cgroupns=host --hostname benchmark-v3-authority --read-only \
        --tmpfs /tmp:rw,exec,nosuid,nodev,mode=1777 \
        --tmpfs /usr/local/libexec:rw,exec,nosuid,nodev,mode=0755 \
        --mount "type=bind,src=$source_root,dst=/workspace/source,readonly" \
        --mount "type=bind,src=$campaign_root,dst=/campaign" \
        --mount "type=bind,src=$oauth_parent,dst=/run/secrets/openai-oauth" \
        --mount "type=volume,src=$custody_volume,dst=/var/lib/opencode-harness" \
        --mount "type=volume,src=$channel_volume,dst=/run/opencode-harness" \
        --env OPENAI_OAUTH_STATE_FILE=/run/secrets/openai-oauth/openai-oauth-state.jsonl \
        --env BENCHMARK_V3_CGROUP_REQUIRED=1 \
        --env "BENCHMARK_V3_OPERATOR_IMAGE_ID=$image_fingerprint" \
        --env "BENCHMARK_V3_PROVIDER_ONLY_EGRESS=$provider_only" \
        --env "BENCHMARK_V3_PROVIDER_AUTH_MODE=$provider_auth_mode" \
        "$image_id" "$@"
    fi
    if [ -n "${BENCHMARK_V3_OPENAI_KEY_FILE:-}" ]; then
      exec docker run --rm --privileged --cgroupns=host --hostname benchmark-v3-authority --read-only \
        --tmpfs /tmp:rw,exec,nosuid,nodev,mode=1777 \
        --tmpfs /usr/local/libexec:rw,exec,nosuid,nodev,mode=0755 \
        --mount "type=bind,src=$source_root,dst=/workspace/source,readonly" \
        --mount "type=bind,src=$campaign_root,dst=/campaign" \
        --mount "type=bind,src=$BENCHMARK_V3_OPENAI_KEY_FILE,dst=/run/secrets/openai_api_key,readonly" \
        --mount "type=volume,src=$custody_volume,dst=/var/lib/opencode-harness" \
        --mount "type=volume,src=$channel_volume,dst=/run/opencode-harness" \
        --env OPENAI_API_KEY_FILE=/run/secrets/openai_api_key \
        --env BENCHMARK_V3_CGROUP_REQUIRED=1 \
        --env "BENCHMARK_V3_OPERATOR_IMAGE_ID=$image_fingerprint" \
        --env "BENCHMARK_V3_PROVIDER_ONLY_EGRESS=$provider_only" \
        --env "BENCHMARK_V3_PROVIDER_AUTH_MODE=$provider_auth_mode" \
        "$image_id" "$@"
    fi
    exec docker run --rm --privileged --cgroupns=host --hostname benchmark-v3-authority --read-only \
      --tmpfs /tmp:rw,exec,nosuid,nodev,mode=1777 \
      --tmpfs /usr/local/libexec:rw,exec,nosuid,nodev,mode=0755 \
      --mount "type=bind,src=$source_root,dst=/workspace/source,readonly" \
      --mount "type=bind,src=$campaign_root,dst=/campaign" \
      --mount "type=volume,src=$custody_volume,dst=/var/lib/opencode-harness" \
      --mount "type=volume,src=$channel_volume,dst=/run/opencode-harness" \
      --env BENCHMARK_V3_CGROUP_REQUIRED=1 \
      --env "BENCHMARK_V3_OPERATOR_IMAGE_ID=$image_fingerprint" \
      --env "BENCHMARK_V3_PROVIDER_ONLY_EGRESS=$provider_only" \
      --env "BENCHMARK_V3_PROVIDER_AUTH_MODE=$provider_auth_mode" \
      "$image_id" "$@"
    ;;
  *)
    echo "unknown operator container action: $action" >&2
    exit 66
    ;;
esac
