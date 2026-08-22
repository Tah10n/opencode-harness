# Public-check-failure-only remediation

After the primary attempt, the host runs the runner-selected trusted public
check. A single contract-auditor pass is eligible only when that check returns
`failed`. High-risk labels, visible categories, and missing-target observations
alone cannot activate the pass.

The auditor receives only visible requirements, the current public diff, the
pinned public check, and its bounded public diagnostic. Any mutation is checked
against the declared path scope and re-runs the same pinned check. If the
mutation does not pass, the host restores the exact pre-audit workspace and
re-verifies it. Unavailable infrastructure remains fail-closed and cannot
activate remediation.
