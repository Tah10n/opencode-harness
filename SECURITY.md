# Security Policy

## Supported Versions

The latest release tag and the `main` branch receive security fixes.

## Reporting a Vulnerability

Please report vulnerabilities through GitHub private vulnerability reporting
when available, or open a minimal issue that does not include secrets, tokens,
private logs, or exploitable details.

Do not paste credentials, private keys, `.env` values, raw production logs, or
machine-specific private data into public issues.

## Scope

This repository is a behavior profile for OpenCode. Security-sensitive changes
usually involve:

- command permissions;
- read/write tool exposure;
- self-improvement boundaries;
- memory persistence rules;
- examples that could encourage unsafe configuration.

Before merging such changes, run `npm run verify` and inspect the effective
OpenCode config in the target host environment.
