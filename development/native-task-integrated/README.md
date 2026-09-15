# Two integrated tasks, three existing configurations

The separately authorized final pair is complete: [continuation results and all 12 slots](CONTINUATION-RESULTS.md). The original RESULTS.md remains the first-period historical record.

This directory records a fixed development comparison of ordinary OpenCode, stock direct harness, and direct plus optional sensitivity/investigation. The task is complete when an unchanged portable patch satisfies its public contract, compatibility and required tests/types/docs and is delivered autonomously with verified termination.

**The campaign is closed to further execution:** the frozen policy stopped at slot 10 with unknown submission. Do not resume the launcher or fill the two not_started slots. Read [results and product decision](RESULTS.md), [frozen plan](PLAN.md), [all assigned outcomes](results.json), and [configuration/accounting audit](accounting-audit.json).

## Recheck a patch without a model

Use an ordinary disposable Git copy of the exact public input. A corresponds to `Tah10n/Tahion_Personal_site` commit `1198822c5715651cf654c49cae719c92253dd498`; B corresponds to `unjs/ufo` commit `f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6`. Source history and evaluation/reference files were not available in the model containers.

1. Materialize that commit, retain its lockfile, and prepare matching dependencies for the target platform before offline execution. The measured environment used Node 24.19.0 and the frozen source/dependency manifests in [frozen-inputs.json](frozen-inputs.json). The site needed the same-version Linux Rollup/esbuild native packages. UFO's locally supplied pnpm was 10.33.2; it was not on the ordinary shell PATH. Reinstalling dependencies during the attempt is unnecessary and can destroy the available installation.
2. Apply one `patches/nNN.patch` with `git apply --binary`. Do not edit the patch to make it pass. `results.json` binds each patch's SHA-256 to its slot. n03 is the interrupted attempt's retained working-tree patch; all other H patches are actual terminal patches, and P patches are complete final-tree diffs including new files.
3. Run the original project checks below in an isolated environment. Network access is unnecessary once dependencies are present. Keep reference/evaluator files outside the project until the delivered project checks finish.

### A: real preferences consumers

```sh
npm run check
```

The original historical source has a CRLF/Prettier mismatch. For a baseline comparison record that failure separately and run `npm run lint`, the delivered `npm test`, and `npm run build` independently. Every submitted A patch repaired the mismatch and its whole check passes.

For the frozen browser assertions, build the applied project and run the published evaluator from this repository:

```sh
PLAYWRIGHT_PACKAGE_JSON=/absolute/path/to/package-with-playwright/package.json \
  node development/native-task-integrated/evaluation/serve-check.mjs \
  /absolute/path/to/applied-site /absolute/path/to/result.png
```

The Playwright package needs Chromium already installed. Its server serves only the built dist at the existing GitHub Pages base path. The evaluator blocks non-loopback requests and exercises actual controls/canvas/document theme, reload, two tabs and storage errors. Published browser/server files retain the frozen assertions; only their dependency/script location lookup was made portable. The original exact frozen hashes remain recorded in the freeze manifest/preparation commit.

### B: public APIs, types and compatibility

In the applied UFO copy:

```sh
export PATH="$PWD/node_modules/.bin:$PATH"
npm test
npm run build
```

If npm test stops at lint, retain its failure and separately run `node node_modules/vitest/vitest.mjs run --typecheck` and `npm run build`. Passing those does not erase the lint failure.

After project checks, copy `evaluation/url-contract.test.ts` and `evaluation/public-types.test-d.ts` into the project root as `external-contract.test.ts` and `external-type.test-d.ts`:

```sh
node node_modules/vitest/vitest.mjs run \
  external-contract.test.ts external-type.test-d.ts --typecheck
```

The type file is derived from the pre-model reference type regression; the import path alone is adapted to the project root. Also copy `evaluation/append-compatibility.test.ts` into the project root and run it with Vitest. This **post-run follow-up** checks a previously declared overlay contract that the frozen finite calibration missed; see the explicit caveat in [RESULTS.md](RESULTS.md). It is applied equally to all four B candidates and both unchanged calibration solutions.

### Delivered regression sensitivity

The per-candidate `reviews/*-sensitivity.json` records the exact source replacement, before/after hashes and observed failure. Apply that replacement only in a separate evaluation copy, after the unchanged patch passes its relevant runtime checks. For A, suppress only the legacy-migration persistence call and run the delivered npm test. For B, make the URLSearchParams stringify branch return an empty string and run the delivered `test/query.test.ts` with Vitest. Inspect the reported behavioral failure; an infrastructure/import error is not detection. n07's equivalent earlier migration check is recorded in its acceptance review.

These are evaluator-only checks of meaningful declared behaviors, not additional model runs or a demanded Stryker mutant. Author files, frozen reference files and submitted patches remain unchanged.

## Preparation and evidence

`PLAN.md`, both task requests, the assigned order and executable launcher inputs were frozen and pushed before the first real request. `preparation.json` records the actual-input scripted preflight and calibrated correct/alternative/wrong controls. `calibration/*.patch` preserves the two original calibration solutions per project, including the subsequently discovered UFO gap; those solutions were never forwarded to the authors.

`run.mjs`, `native-run.mjs` and the container wrapper document the original execution path and its 1800-second envelope. They reuse the established provider forwarding/terminal policy and exact product bundle. They are not permission to rerun this closed series. The runtime stayed at `797ce6f1b75af217e00224d1b38790346dee1d19`; no product code or default changes are delivered here.

Raw requests, session traces, full source/dependency trees and local containers are excluded from publication. Compact reviews distinguish original project checks, independent behavior, types, test sensitivity, final claims and the confirmed stop. Preparation/evaluation model calls were zero; the developing agent's own usage is outside the task-request ledger.

Patch artifacts are stored with `-text` so Git does not normalize their bytes. Unified-diff context lines containing a single space are part of the patch format and trigger an outer `git diff --check`; check ordinary code/docs separately and validate the applied patch in its own project. Do not strip those context markers or normalize calibration patch line endings.
