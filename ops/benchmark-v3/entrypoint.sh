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

case "${BENCHMARK_V3_PROVIDER_AUTH_MODE:-api}" in
  api)
    if [ -n "${OPENAI_OAUTH_STATE_FILE:-}" ]; then echo "OAuth state requires oauth provider authorization mode" >&2; exit 68; fi
    ;;
  oauth)
    if [ -n "${OPENAI_API_KEY_FILE:-}" ]; then echo "API key requires api provider authorization mode" >&2; exit 68; fi
    ;;
  *) echo "provider authorization mode is invalid" >&2; exit 68 ;;
esac

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
if [ -n "${OPENAI_OAUTH_STATE_FILE:-}" ]; then
  if [ ! -f "$OPENAI_OAUTH_STATE_FILE" ] || [ -L "$OPENAI_OAUTH_STATE_FILE" ]; then
    echo "OPENAI_OAUTH_STATE_FILE is unavailable" >&2
    exit 71
  fi
  oauth_mode="$(stat -c '%a' "$OPENAI_OAUTH_STATE_FILE")"
  oauth_size="$(stat -c '%s' "$OPENAI_OAUTH_STATE_FILE")"
  if [ "$oauth_mode" != "600" ] || [ "$oauth_size" -lt 1 ] || [ "$oauth_size" -gt 262144 ]; then
    echo "provider OAuth state file is invalid" >&2
    exit 72
  fi
fi

if [ "${BENCHMARK_V3_PROVIDER_ONLY_EGRESS:-0}" = "1" ]; then
  test -s /etc/resolv.conf
  provider_addresses=/tmp/benchmark-v3-provider-addresses
  provider_endpoints=/tmp/benchmark-v3-provider-endpoints
  provider_hosts=/tmp/benchmark-v3-provider-hosts
  provider_ips=/tmp/benchmark-v3-provider-ips
  case "${BENCHMARK_V3_PROVIDER_AUTH_MODE:-api}" in
    api) printf '%s\n' api.openai.com > "$provider_endpoints" ;;
    oauth) printf '%s\n' auth.openai.com chatgpt.com > "$provider_endpoints" ;;
    *) echo "provider authorization mode is invalid" >&2; exit 73 ;;
  esac
  : > "$provider_addresses"
  while IFS= read -r provider_host; do
    getent ahostsv4 "$provider_host" | awk -v host="$provider_host" '{ print $1, host }' | sort -u >> "$provider_addresses"
  done < "$provider_endpoints"
  test -s "$provider_addresses"
  cp /etc/hosts "$provider_hosts"
  while read -r address provider_host; do
    case "$address" in
      *[!0-9.]*|'') echo "provider resolution returned a non-IPv4 address" >&2; exit 70 ;;
    esac
    case "$provider_host" in api.openai.com|auth.openai.com|chatgpt.com) ;; *) echo "provider host is invalid" >&2; exit 74 ;; esac
    printf '%s\t%s\n' "$address" "$provider_host" >> "$provider_hosts"
  done < "$provider_addresses"
  chmod 0444 "$provider_hosts"
  mount --bind "$provider_hosts" /etc/hosts
  mount -o remount,bind,ro /etc/hosts
  awk '{ print $1 }' "$provider_addresses" | sort -u > "$provider_ips"
  iptables -F OUTPUT
  iptables -P OUTPUT DROP
  iptables -A OUTPUT -o lo -j ACCEPT
  iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  while IFS= read -r address; do
    iptables -A OUTPUT -p tcp -d "$address" --dport 443 -j ACCEPT
  done < "$provider_ips"
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
