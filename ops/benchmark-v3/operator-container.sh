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
custody_volume="${BENCHMARK_V3_CUSTODY_VOLUME:-opencode-harness-benchmark-v3-custody}"
channel_volume="${BENCHMARK_V3_CHANNEL_VOLUME:-opencode-harness-benchmark-v3-channels}"

case "$action" in
  build)
    exec docker build --file "$source_root/ops/benchmark-v3/Dockerfile" --tag "$image" "$source_root"
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
    if [ -n "${BENCHMARK_V3_OPENAI_KEY_FILE:-}" ]; then
      if [ ! -f "$BENCHMARK_V3_OPENAI_KEY_FILE" ] || [ -L "$BENCHMARK_V3_OPENAI_KEY_FILE" ]; then
        echo "BENCHMARK_V3_OPENAI_KEY_FILE must be a non-symlink regular file" >&2
        exit 68
      fi
      key_mode="$(stat -f '%Lp' "$BENCHMARK_V3_OPENAI_KEY_FILE" 2>/dev/null || stat -c '%a' "$BENCHMARK_V3_OPENAI_KEY_FILE")"
      if [ "$key_mode" != "400" ] && [ "$key_mode" != "600" ]; then
        echo "BENCHMARK_V3_OPENAI_KEY_FILE must have mode 0400 or 0600" >&2
        exit 69
      fi
      exec docker run --rm --privileged --cgroupns=host --hostname benchmark-v3-authority --read-only \
        --tmpfs /tmp:rw,exec,nosuid,nodev,mode=1777 \
        --tmpfs /usr/local/libexec:rw,exec,nosuid,nodev,mode=0755 \
        --mount "type=bind,src=$source_root,dst=/workspace/source,readonly" \
        --mount "type=bind,src=$campaign_root,dst=/campaign" \
        --mount "type=bind,src=$BENCHMARK_V3_OPENAI_KEY_FILE,dst=/run/secrets/openai_api_key,readonly" \
        --mount "type=volume,src=$custody_volume,dst=/var/lib/opencode-harness" \
        --mount "type=volume,src=$channel_volume,dst=/run/opencode-harness" \
        --env OPENAI_API_KEY_FILE=/run/secrets/openai_api_key \
        --env "BENCHMARK_V3_PROVIDER_ONLY_EGRESS=${BENCHMARK_V3_PROVIDER_ONLY_EGRESS:-0}" \
        "$image" "$@"
    fi
    exec docker run --rm --privileged --cgroupns=host --hostname benchmark-v3-authority --read-only \
      --tmpfs /tmp:rw,exec,nosuid,nodev,mode=1777 \
      --tmpfs /usr/local/libexec:rw,exec,nosuid,nodev,mode=0755 \
      --mount "type=bind,src=$source_root,dst=/workspace/source,readonly" \
      --mount "type=bind,src=$campaign_root,dst=/campaign" \
      --mount "type=volume,src=$custody_volume,dst=/var/lib/opencode-harness" \
      --mount "type=volume,src=$channel_volume,dst=/run/opencode-harness" \
      --env "BENCHMARK_V3_PROVIDER_ONLY_EGRESS=${BENCHMARK_V3_PROVIDER_ONLY_EGRESS:-0}" \
      "$image" "$@"
    ;;
  *)
    echo "unknown operator container action: $action" >&2
    exit 66
    ;;
esac
