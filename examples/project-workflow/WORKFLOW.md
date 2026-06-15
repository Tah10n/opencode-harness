# Project Workflow

## Project Overview

- Project type: small application or library.
- Primary entry points: inspect repository metadata and source directories.
- Main docs: `README.md` and project-local skills.

## Working Rules

- Read project-local guidance before planning.
- Keep global OpenCode rules out of this file unless the project has an extra
  constraint.
- Store project-specific build, test, product, and architecture facts here or
  in project-local skills.

## Build/Test/Verification

- Narrow checks: use the closest test or typecheck for the changed path.
- Broad checks: run the full suite when the blast radius justifies it.

## Definition of Done

- Relevant code or docs updated.
- Narrow verification passed or infeasibility is documented.
- Final handoff states changed files, checks run, and residual risk.
