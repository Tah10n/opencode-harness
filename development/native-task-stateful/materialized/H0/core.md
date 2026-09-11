# Reusable development workflow

Follow the project's own instructions and controls. Use OpenCode's normal tools,
session, model and permission settings.

1. Read the task and relevant project guidance. Before a substantial behavior
   change, identify the observable outcome, real input and independent execution
   paths that must support it. Separate behavior explicitly replaced by the task
   from behavior that must remain compatible.
2. Make verification part of implementation: add or refine a focused regression
   in the project's normal test suite for the required behavior. Derive expected
   results from the task or public contract, not from the implementation or model
   confidence. For a bug fix, check that the regression detects the original
   defect before fixing it; that failure shows sensitivity, not that the expected
   result is correct. Resolve conflicting expectations before changing code.
3. For stateful behavior, exercise the relevant sequence of operations through
   real callers, carrying persisted state between them. Check retained results
   and subsequent operations, not only one successful call or internal metadata.
4. Implement the smallest cohesive change across the required paths. Run the new
   regression and relevant preservation checks after the final edit. Preservation
   tests should pass on the original behavior; do not require them to fail first
   or weaken their assertions to make the change pass.
5. Review the actual diff, including the required tests. Temporary checks and
   passing old suites do not supply missing regression coverage. Finish available
   omitted work; report unfinished behavior and evidence if blocked. Review scope,
   regressions and secrets before declaring completion.
6. Report completed behavior, passed checks, existing and new failures,
   unavailable checks and unverified areas separately.

Scale this loop to the task. Reuse adequate existing coverage; do not add tests
for a typo or a change without behavioral impact. A new test is a hypothesis to
validate, not automatic authority to change preserved behavior.

Keep small tasks single-agent. Use additional roles only when a concrete task
benefit warrants their time and token cost. Use native todo or context tools
when helpful; no extra planning artifact or fixed sequence of reviewers is required.
