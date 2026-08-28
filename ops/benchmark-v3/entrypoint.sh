#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "benchmark v3 operator container must start as root" >&2
  exit 64
fi
if [ ! -d /workspace/source ] || [ ! -f /workspace/source/package.json ]; then
  echo "a frozen source tree must be mounted at /workspace/source" >&2
  exit 66
fi
if [ "$(realpath /run/opencode-harness)" != "$(realpath /var/run/opencode-harness)" ]; then
  echo "/run and /var/run operator channel roots are not the same mount" >&2
  exit 75
fi

chmod 0700 /var/lib/opencode-harness
chmod 0700 /var/run/opencode-harness
case "${BENCHMARK_V3_REVIEWER_ONLY:-}" in
  '') ;;
  one|two)
    if [ "${BENCHMARK_V3_CGROUP_REQUIRED:-1}" != "0" ] \
      || [ ! -d /var/lib/opencode-harness-reviewer ]; then
      echo "reviewer custody bootstrap requires the isolated model-free mount" >&2
      exit 78
    fi
    chown root:root /var/lib/opencode-harness-reviewer
    chmod 0700 /var/lib/opencode-harness-reviewer
    ;;
  *) echo "BENCHMARK_V3_REVIEWER_ONLY must be one or two" >&2; exit 79 ;;
esac
if [ "${BENCHMARK_V3_CGROUP_REQUIRED:-1}" = "1" ]; then
  case "${BENCHMARK_V3_OPERATOR_IMAGE_ID:-}" in
    sha256:????????????????????????????????????????????????????????????????) ;;
    *) echo "privileged operator image identity is invalid" >&2; exit 76 ;;
  esac
  if [ "${BENCHMARK_V3_PROVIDER_ONLY_EGRESS:-0}" != "1" ]; then
    echo "privileged operator requires provider-only egress" >&2
    exit 77
  fi
  chown root:root /var/lib/opencode-harness /var/run/opencode-harness
else
  test "$(stat -c '%u:%g' /var/lib/opencode-harness)" = "0:0"
  test "$(stat -c '%u:%g' /var/run/opencode-harness)" = "0:0"
fi
for directory in \
  /var/lib/opencode-harness/benchmark-v3-executions \
  /var/run/opencode-harness/readiness \
  /var/run/opencode-harness/reviews/reviewer-one \
  /var/run/opencode-harness/reviews/reviewer-two \
  /var/run/opencode-harness/execution-authority \
  /var/run/opencode-harness/holdout \
  /var/run/opencode-harness/takeovers
do
  install -d -o root -g root -m 0700 "$directory"
done

cgroup_root=""
helper=""
if [ "${BENCHMARK_V3_CGROUP_REQUIRED:-1}" = "1" ]; then
  if [ ! -r /sys/fs/cgroup/cgroup.controllers ]; then
    echo "writable cgroup v2 is required" >&2
    exit 65
  fi
  cgroup_root="/sys/fs/cgroup/opencode-harness-operator-${HOSTNAME}"
  if [ -e "$cgroup_root" ]; then
    echo "operator cgroup root already exists; audited cleanup is required" >&2
    exit 67
  fi
  mkdir "$cgroup_root"
  helper="/usr/local/libexec/opencode-cgroup-attach-${HOSTNAME}"
  node /workspace/source/scripts/build-linux-cgroup-attach-helper.mjs \
    --out "$helper" --uid 0 --trusted-root-coordinator \
    --control "$cgroup_root/opencode-quality-workload/cgroup.procs"
  chown root:root "$helper"
  chmod 0555 "$helper"
fi

cleanup() {
  if [ -n "$helper" ]; then rm -f "$helper"; fi
  if [ -n "$cgroup_root" ] && [ -d "$cgroup_root" ]; then
    rmdir "$cgroup_root" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [ -n "$cgroup_root" ]; then
  export OPENCODE_QUALITY_CGROUP_ROOT="$cgroup_root"
  export OPENCODE_QUALITY_CGROUP_ATTACH_MODE="sudo-helper-v2"
  export OPENCODE_QUALITY_CGROUP_ATTACH_HELPER="$helper"
  export OPENCODE_QUALITY_TRUSTED_ROOT_COORDINATOR="v1"
fi

if [ -n "${OPENAI_API_KEY_FILE:-}" ]; then
  if [ ! -f "$OPENAI_API_KEY_FILE" ]; then
    echo "OPENAI_API_KEY_FILE is unavailable" >&2
    exit 68
  fi
  IFS= read -r OPENAI_API_KEY < "$OPENAI_API_KEY_FILE"
  if [ "${#OPENAI_API_KEY}" -lt 16 ]; then
    echo "provider authorization file is invalid" >&2
    exit 69
  fi
  export OPENAI_API_KEY
  unset OPENAI_API_KEY_FILE
fi

if [ "${BENCHMARK_V3_PROVIDER_ONLY_EGRESS:-0}" = "1" ]; then
  test -s /etc/resolv.conf
  provider_addresses=/tmp/benchmark-v3-provider-addresses
  provider_hosts=/tmp/benchmark-v3-provider-hosts
  getent ahostsv4 api.openai.com | awk '{ print $1 }' | sort -u > "$provider_addresses"
  test -s "$provider_addresses"
  cp /etc/hosts "$provider_hosts"
  while IFS= read -r address; do
    case "$address" in
      *[!0-9.]*|'') echo "provider resolution returned a non-IPv4 address" >&2; exit 70 ;;
    esac
    printf '%s\tapi.openai.com\n' "$address" >> "$provider_hosts"
  done < "$provider_addresses"
  chmod 0444 "$provider_hosts"
  mount --bind "$provider_hosts" /etc/hosts
  mount -o remount,bind,ro /etc/hosts
  iptables -F OUTPUT
  iptables -P OUTPUT DROP
  iptables -A OUTPUT -o lo -j ACCEPT
  iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  while IFS= read -r address; do
    iptables -A OUTPUT -p tcp -d "$address" --dport 443 -j ACCEPT
  done < "$provider_addresses"
  iptables -A OUTPUT -j REJECT
  ip6tables -F OUTPUT
  ip6tables -P OUTPUT DROP
  ip6tables -A OUTPUT -o lo -j ACCEPT
  ip6tables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
fi

"$@" &
child=$!
wait "$child"
status=$?
exit "$status"
