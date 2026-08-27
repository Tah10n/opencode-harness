#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "benchmark v3 operator container must start as root" >&2
  exit 64
fi
if [ ! -r /sys/fs/cgroup/cgroup.controllers ]; then
  echo "writable cgroup v2 is required" >&2
  exit 65
fi
if [ ! -d /workspace/source ] || [ ! -f /workspace/source/package.json ]; then
  echo "a frozen source tree must be mounted at /workspace/source" >&2
  exit 66
fi

chmod 0700 /var/lib/opencode-harness
chown root:root /var/lib/opencode-harness
chmod 0700 /var/run/opencode-harness
chown root:root /var/run/opencode-harness
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

cleanup() {
  rm -f "$helper"
  if [ -d "$cgroup_root" ]; then
    rmdir "$cgroup_root" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

export OPENCODE_QUALITY_CGROUP_ROOT="$cgroup_root"
export OPENCODE_QUALITY_CGROUP_ATTACH_MODE="sudo-helper-v2"
export OPENCODE_QUALITY_CGROUP_ATTACH_HELPER="$helper"
export OPENCODE_QUALITY_TRUSTED_ROOT_COORDINATOR="v1"

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
  resolver="$(awk '/^nameserver / { print $2; exit }' /etc/resolv.conf)"
  test -n "$resolver"
  iptables -F OUTPUT
  iptables -P OUTPUT DROP
  iptables -A OUTPUT -o lo -j ACCEPT
  iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  iptables -A OUTPUT -p udp -d "$resolver" --dport 53 -j ACCEPT
  iptables -A OUTPUT -p tcp -d "$resolver" --dport 53 -j ACCEPT
  getent ahostsv4 api.openai.com | awk '{ print $1 }' | sort -u | while IFS= read -r address; do
    iptables -A OUTPUT -p tcp -d "$address" --dport 443 -j ACCEPT
  done
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
