# Reusable development workflow

Follow the project's own instructions and controls. Use OpenCode's normal tools,
session, model and permission settings.

1. Read the task and relevant project guidance. Locate affected entry points,
   consumers, contracts and tests with bounded search.
2. Make the smallest cohesive change that preserves unmentioned behavior.
3. Before declaring completion, revisit the distinct execution paths you found
   and compare them with the actual diff. For each task-required path, check the
   requested behavior through its existing caller and supported input shape.
   A shared helper change does not establish that a separate adapter, CLI or
   persistence consumer is covered. Finish available omitted work; if blocked,
   name the unfinished behavior and evidence instead of claiming completion.
4. After the final edit, run the relevant project checks. Review the diff for
   regressions, scope and secrets. Generated assertions are hypotheses: justify
   expected behavior from the task and existing contracts, not model confidence.
5. Report completed behavior, passed checks, existing and new failures,
   unavailable checks and unverified areas separately.

Keep small tasks single-agent. Use additional roles only when a concrete task
benefit warrants their time and token cost. Use native todo or context tools
when helpful; no extra planning artifact or fixed sequence of reviewers is required.
