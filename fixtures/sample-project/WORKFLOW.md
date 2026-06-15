# Sample Project Workflow

## Project Overview

- Project type: fixture.
- Primary entry point: `src/app.js`.
- Tests: `test/app.test.js`.

## Working Rules

- Prefer narrow checks before broad checks.
- Keep fixture-specific facts out of global memory.

## Agent Delegation

- `@explore`: use for read-only file and test discovery.
- `@reviewer`: use for read-only review.
- `@verifier`: use for targeted checks after integration.

## Build/Test/Verification

- Narrow checks: `node --test test/app.test.js`.
- Broad checks: `node --test`.
