# Verified-change implementation and delivery plan

This delivery continues the existing `feat/verified-change-harness` branch.
Its base, `89f1f7f1980a829d7da162fcd737d0c52613225d`, still matches remote
`main` as checked on 2026-09-07. The eight existing commits contain the product,
three development revisions, corpus and freeze. Recreating those changes would
duplicate the same experiment. Historical results remain unchanged.

Reuse the installed OpenCode 1.18.26 CLI, its existing provider authorization,
the standalone package in `product/verified-change`, the installed local Docker
image, and the existing tests and frozen evaluation runner. The historical profile
materializer continues to serve profiles; this independent product materializes
through `npm pack` and prefix installation. Its package contains no lab imports.

The implemented user scenario is: a clean Git worktree and visible requirement
enter `opencode-harness run`; an independent session prepares acceptance tests
against the original source; OpenCode produces D0; host checks reproduce failures;
at most two repairs receive bounded, actionable diagnostics. Unsupported tests,
environment failures and regressions cannot justify automatic source changes.
Patches remain available, and publication checks for concurrent user changes.

The remaining delivery work is bounded:

1. Recheck installed product scenarios and installed A/B/C orchestration without
   consuming final-task model observations. Verify frozen file and bundle hashes.
2. Add a current status report outside the frozen package and runner files. Expose
   protocol gaps, especially the missing equivalent hard model budget for B/C.
3. If the previously required direct external-model authorization is provided,
   execute the existing single 60-task manifest without retries or modifications.
   Otherwise preserve the unstarted state and report missing measurements.
4. Publish one draft PR with the product, installation instructions, test evidence,
   immutable manifest and honest status. Add measured results only when obtained.

No further development revision, replacement corpus, new evaluation, merge or
release is part of this continuation. A positive result must satisfy the frozen
analysis and retain all 60 observations; mechanism tests cannot establish lift.
