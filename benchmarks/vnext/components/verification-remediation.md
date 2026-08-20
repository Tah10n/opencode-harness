# Host-owned verification remediation

Development-only component. When the runner-selected trusted visible check
settles as `failed`, the host starts exactly one fresh bounded edit attempt with
the visible requirements and the fact that verification failed. Hidden files,
hidden output, reference solutions, executable selection, argv, and check IDs
remain unavailable to the model. A workspace mutation makes prior verification
stale and the runner repeats the same trusted check before terminal success.

The retry does not run for passed, unavailable, incomplete, or unrelated
infrastructure outcomes. It has no second retry and no production status until
paired development and validation evidence pass the frozen policy.
