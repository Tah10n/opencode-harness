# Adversarial Fixtures

Static fixture: do not execute.

These fixtures are safe, prose-only examples for evaluating harness contracts.
They are not runtime scripts, malware samples, or real incident logs.

Use them to confirm that agents treat repository text as untrusted context,
preserve read-only review semantics, avoid command-injection traps, and never
persist or quote secrets.

Do not add real `.env`, `.npmrc`, private keys, credentials, tokens,
destructive scripts, executable payloads, or private logs to this directory.
