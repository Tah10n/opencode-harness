#!/bin/sh
set -eu

reviewer="${1:-}"
action="${2:-}"
if [ "$reviewer" != "one" ] && [ "$reviewer" != "two" ]; then
  echo "usage: reviewer-container.sh one|two init|sign <arguments...>" >&2
  exit 64
fi
if [ "$action" != "init" ] && [ "$action" != "sign" ]; then
  echo "usage: reviewer-container.sh one|two init|sign <arguments...>" >&2
  exit 64
fi
shift 2

docker_context="${BENCHMARK_V3_REVIEWER_DOCKER_CONTEXT:-}"
custody_volume="${BENCHMARK_V3_REVIEWER_CUSTODY_VOLUME:-}"
review_root="${BENCHMARK_V3_REVIEW_ROOT:-}"
source_root="${BENCHMARK_V3_SOURCE_ROOT:-$(pwd -P)}"
image="${BENCHMARK_V3_OPERATOR_IMAGE:-opencode-harness-benchmark-v3-operator:1.0.0}"
reviewed_sha="${BENCHMARK_V3_REVIEWED_SOURCE_SHA:-}"
if [ -z "$docker_context" ] || [ -z "$custody_volume" ] || [ -z "$review_root" ]; then
  echo "reviewer Docker context, opaque custody volume, and private review root are required" >&2
  exit 65
fi
canonical_source="$(cd "$source_root" && pwd -P)"
canonical_review="$(cd "$review_root" && pwd -P)"
if [ "$source_root" != "$canonical_source" ] || [ "$review_root" != "$canonical_review" ] \
  || [ "$(git -C "$source_root" rev-parse HEAD)" != "$reviewed_sha" ] \
  || [ -n "$(git -C "$source_root" status --porcelain=v1 --untracked-files=all)" ]; then
  echo "reviewer signer requires the exact clean independently reviewed source" >&2
  exit 66
fi
image_id="$(docker --context "$docker_context" image inspect --format '{{.Id}}' "$image")"
image_arch="$(docker --context "$docker_context" image inspect --format '{{.Architecture}}' "$image_id")"
expected_image_id="$(node -e 'const fs=require("fs");const [f,a]=process.argv.slice(1);const v=JSON.parse(fs.readFileSync(f));process.stdout.write(v.images[a]?.image_id||"")' \
  "$source_root/benchmarks/v3/operator-image.v1.json" "$image_arch")"
if [ "$image_id" != "$expected_image_id" ]; then
  echo "reviewer image does not match the committed immutable image ID" >&2
  exit 67
fi
case "$action" in
  init) entrypoint="scripts/benchmark-v3-reviewer-init.mjs" ;;
  sign) entrypoint="scripts/benchmark-v3-review-sign.mjs" ;;
esac

exec docker --context "$docker_context" run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
  --hostname "benchmark-v3-external-reviewer-$reviewer" --read-only \
  --tmpfs /tmp:rw,exec,nosuid,nodev,mode=1777 \
  --tmpfs /run/opencode-harness:rw,nosuid,nodev,noexec,mode=0700 \
  --tmpfs /var/lib/opencode-harness:rw,nosuid,nodev,noexec,mode=0700 \
  --mount "type=bind,src=$source_root,dst=/workspace/source,readonly" \
  --mount "type=bind,src=$review_root,dst=/review" \
  --mount "type=volume,src=$custody_volume,dst=/var/lib/opencode-harness-reviewer" \
  --env BENCHMARK_V3_CGROUP_REQUIRED=0 --env "BENCHMARK_V3_REVIEWER_ONLY=$reviewer" \
  --env "BENCHMARK_V3_OPERATOR_IMAGE_ID=$image_id" \
  "$image_id" node "/workspace/source/$entrypoint" --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness-reviewer --reviewer "$reviewer" "$@"
