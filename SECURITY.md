# Security Policy

The maintained `main` branch receives security fixes. Historical releases and
archived runtime generations do not establish current native security coverage.

Report vulnerabilities through GitHub private vulnerability reporting when
available, or open a minimal issue without exploitable details. Never include
credentials, private keys, environment values, personal data or raw private logs.

Security-sensitive changes include effective OpenCode permissions, checkout and
index preservation, worktree/patch ownership, deadline and cancellation, artifact
provenance, unknown outcomes, generated expectations and evaluation containment.

Run `npm run verify` and `npm run verify:installed` for affected native boundaries.
Evaluation containment also requires the actual container check in CI. The
required `Harness verification` gate depends on both executed jobs. Historical
cross-platform quality-runtime checks do not validate the current native product.
Preserve code-owner review and the configured branch protection; do not bypass
required checks or reviews. Technical fixtures do not certify arbitrary hostile
host-process containment or model correctness.
