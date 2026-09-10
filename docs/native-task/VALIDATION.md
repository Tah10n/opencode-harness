# Pre-pilot validation

Base PR #24 was verified open at
`1e54e21018e340191e69a8f9427ccf8e3330bfcd`. The workflow is a separate branch;
the diagnostic command remains unchanged.

Model-free checks before freezing the candidate:

- Native template materialization and CLI compatibility passed.
- Diagnostic review snapshot/path/permission checks and installed configuration passed.
- Existing installed diagnostic review fixture passed (12 scripted requests).
- Task evidence-gate regressions passed: last mutation including restored bytes,
  environment failure rejection, production protection during reproduction,
  restricted verification paths and malformed report rejection.
- Installed task fixture passed nine scenarios (58 scripted requests): no unnecessary
  repair, reproduced/fixed defect, unsupported finding rejection, actual replacement
  of old coverage, unchecked last mutation, cancellation before next model stage,
  incomplete obligations, concurrent original-checkout save, and partially staged
  user input. Original staged entries/content, not mutable Git stat cache bytes,
  are compared.
- The installed Linux native `run --command harness-task` path passed with the
  existing offline container/relay and six scripted requests. Standard native
  plugin dependencies were provisioned before the run; neither network containment
  nor reviewer permissions were loosened to make startup pass.
- Six-task corpus preflight passed: every initial project's ordinary checks pass;
  each initial project fails at least one new independent requirement; all six
  reference projects pass their ordinary and independent checks. Independent tests
  total 18; initial sources pass 1/18 and references pass 18/18. These numbers are
  preflight discrimination, not model outcomes.

Independent read-only code review found and prompted corrections to stale
verification, reproduction admission, user-work races, missing/coverage repair
paths, disposition re-review, staged input binding and two over-specific grader
assertions. A separate reference/source review checked the visible requirements
against all six references and acceptance suites. Reference project regressions
reuse the acceptance examples, so they are not a second independent proof of the
references. Single-normalizer structure and explicit test/docs completeness are
also fixed source-review criteria in each task's grading description.

Zero real provider requests were used for these validations. Scripted fixtures
establish workflow control only. No model lift or complete-task result follows
from installation, these checks, or a reviewer status.

## Review evidence selection candidate (2026-09-10)

The reviewer receives short, review-scoped references to existing native events.
The original response and resolved bindings are retained separately. Direct
controller regressions cover current selection, unknown/foreign references,
failed/incomplete/stale events, changes and restored bytes, duplicate command
text, ambiguous native IDs, missing obligations, and no extra author execution.
Two retained seat/Map event replays keep their historical incorrect responses and
`incomplete` outcomes unchanged; separate explicit new selections exercise this
implementation. These are not new model outcomes or regraded comparison slots.

Local direct native task, format, template, review and configuration checks
passed on OpenCode 1.18.26. Seven affected installed scenarios passed with 54
scripted requests. One bounded diff review then preserved native document-read
compatibility during review and rejected ambiguous native IDs. After that final
runtime change, direct controller regressions and the three affected installed
paths (correct delivery, documentation, disposition review) passed with 18
scripted requests. Zero real provider requests were used. No historical
255-state audit, completed comparison or platform matrix was rerun.

The runtime and prompts at the next candidate commit are frozen for the separate
four-task A/B/C diagnostic. Its real-project tasks, full prompts and fixed order
live under `development/native-task-abc`; these checks establish wiring only.
