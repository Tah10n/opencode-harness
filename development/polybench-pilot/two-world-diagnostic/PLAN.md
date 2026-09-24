# Post-hoc two-world diagnostic protocol

This is a development-only diagnostic of six known historical deliveries, not a
blind study, official PolyBench score, repaired delivery, or lift experiment.
No author/provider calls, new tasks, continuations or benchmark assertions.

1. Validate the historical M/prediction bytes, dataset CSV, evaluator revision,
   base commits and original image digests. Preserve historical R/T/D and all
   pilot artifacts. Use only Serverless 6534 and Svelte 1190.
2. In a network-none pinned container restore the source B (record image build
   edits separately). Strictly apply T once to construct S. The per-instance
   manifest fixes the assessment surface independently of the arm. Git trees
   bind every source path, blob and mode; absence is part of that inventory.
3. Strictly apply complete M to clean B to make F. Preserve F as an immutable
   Git tree/archive. Execute public/author checks on a disposable copy, without T.
4. Copy the whole F source tree into a separate pinned container. Materialize
   the declared surface exactly from S, including removing author additions
   within it. This makes E. Compare every path and mode outside the surface
   with F, not merely M's paths. Reject symlink/import escapes and mixed-role
   overlays. Configuration changes that invalidate the fixed runner are
   unsupported, never silently reset.
5. Apply only recorded image execution overlays to disposable execution copies
   after source comparison, rejecting intersections with M. Delete stale Svelte
   build products and run the original npm pretest/build recipe on that copy.
   Record build input/output hashes. The official test command is unchanged.
   No gold tree/build/dependencies are mounted. Every run has its own writable
   image layer, process and module cache. No host mounts or Docker socket mount.
6. Check expectations/assertions after execution. Known diagnostic actual/output
   files may change; expected files and runners may not. No update mode is used.
   Reuse pinned parser and instance_level_scoring with original F2P/P2P. Missing
   decisive tests, incomplete runs, preparation/parser errors are unknown/error,
   not a boolean acceptance result. Historical nondecisive failures remain.
7. Before six-arm evaluation: real baseline must fail task assertions; exact
   gold must meet original acceptance. Gold with an overlapping weakened test
   must still pass E; baseline with the same weakened test must still fail E.
   Small preparation controls reject production rollback and gold import targets.
8. Then run F and E for P/H0/H1 on both instances under the same manifests.
   Preserve failed attempts. A confirmed driver defect permits a documented
   correction and rerun of all affected checks, never selection of a best run.
9. Publish separate delivery_apply, delivered_checks, assessment_integrity and
   acceptance_diag plus historical R/T. Final bounded review checks history,
   production identity, imports, expectations, six-row coverage and accounting.

Limits: each test command 1200 seconds (original evaluator default); 8 GiB,
4 CPUs, 1024 PIDs, linux/amd64, cap-drop ALL, no-new-privileges, network none.
Only stage-owned containers are removed. No runtime or upstream edits. Local
logs/snapshots stay ignored; safe results and hashes are published. One final
ordinary push and PR #25 update preserve draft and base; no merge/release.

Manifests and this plan are committed before evaluating any of the six M.
