FROM node:24.11.1-bookworm-slim@sha256:48abc13a19400ca3985071e287bd405a1d99306770eb81d61202fb6b65cf0b57

ARG TARGETARCH
ARG OPENCODE_VERSION=1.18.21
ARG OPENCODE_LINUX_ARM64_SHA256=d30d2cba74617f4e7b96e25563c9572ffe453f9eae70fc0df16286813537ee72
ARG OPENCODE_LINUX_X64_SHA256=d910c3ed7613bb5791a328904615d41cc25b7d3a6b470e3199ab0426a995b38a

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    bubblewrap=0.8.0-2+deb12u1 \
    build-essential=12.9 \
    ca-certificates=20250419~deb12u1 \
    curl=7.88.1-10+deb12u15 \
    git=1:2.39.5-0+deb12u3 \
    iproute2=6.1.0-3 \
    iptables=1.8.9-2 \
    jq=1.6-2.1+deb12u2 \
    sudo=1.9.13p3-1+deb12u4 \
    tini=0.19.0-1+b3 \
  && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
  case "$TARGETARCH" in \
    arm64) asset="opencode-linux-arm64.tar.gz"; expected="$OPENCODE_LINUX_ARM64_SHA256" ;; \
    amd64) asset="opencode-linux-x64.tar.gz"; expected="$OPENCODE_LINUX_X64_SHA256" ;; \
    *) echo "unsupported target architecture: $TARGETARCH" >&2; exit 1 ;; \
  esac; \
  curl --fail --location --proto '=https' --tlsv1.2 \
    "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/${asset}" \
    --output /tmp/opencode.tar.gz; \
  printf '%s  %s\n' "$expected" /tmp/opencode.tar.gz | sha256sum --check --strict; \
  tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin; \
  rm /tmp/opencode.tar.gz; \
  test "$(/usr/local/bin/opencode --version)" = "$OPENCODE_VERSION"; \
  chown root:root /usr/local/bin/opencode; chmod 0555 /usr/local/bin/opencode

RUN install -d -o root -g root -m 0700 /var/lib/opencode-harness \
  && install -d -o root -g root -m 0755 /usr/local/libexec

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/workspace/source/ops/benchmark-v3/entrypoint.sh"]
WORKDIR /workspace/source
