# Patch application contract diagnosis

This investigates exactly nine saved SWE-PolyBench application failures. It does
not run authors, project tests, official scoring, or change the pilot's outcomes.
[REPORT.md](REPORT.md) contains the decision and nine-case table;
[evidence/](evidence/) contains hashes, commands, exits and hunk inventories.

From the `feat/native-task-workflow` worktree, reproduce with one command:

```sh
local/polybench-pilot/venv/bin/python development/polybench-pilot/patch-contract/reproduce.py --out local/polybench-pilot/patch-contract-reproduction
```

The output directory must not exist. Prerequisites are the retained local pilot
venv (Python 3.12, Docker SDK and pandas), the four original per-instance CSVs,
local batch freeze/pause files, historical commit `9317ccc9`, and the four exact
image digests in the evidence. No dependency install, preparation, image build,
implicit pull, latest substitution or provider access occurs. The inspected
upstream checkout is at
`local/polybench-pilot/patch-contract-sources/evaluator`, detached at
`9c836c5d7f3cb991934132b77d29e6941d912a07`; it is only read after checkout.
To reconstruct that checkout from retained local upstream objects:

```sh
git clone --shared --no-hardlinks local/polybench-pilot/evaluator local/polybench-pilot/patch-contract-sources/evaluator
git -C local/polybench-pilot/patch-contract-sources/evaluator checkout --detach 9c836c5d7f3cb991934132b77d29e6941d912a07
```

Only do this if the destination is absent. The driver uses the existing Docker
Desktop socket, or explicit `DOCKER_HOST`. Every container uses linux/amd64,
network-none, cap-drop ALL, no-new-privileges, 8 GiB, four CPUs, 1024 PIDs, no host
mounts and no Docker socket mount. Only its own containers are removed; original
images, sources, evaluation outputs and useful local diagnostics remain.

Each case uses three fresh containers: strict B+M; strict B+T followed by a
non-mutating strict M check; and original image T→M with upstream Git/patch
fallback and cleanup. No reset occurs between upstream attempts. The driver
records the original images' unrelated build edits and restores them only for
strict B scenarios, before applying any patch. Input files are copied and
byte-checked (including final newline); their untracked `patch_*.diff` names
are outside every M/T touched path. The original upstream method overwrites its
own input file as usual. The official scenario retains all baked image edits.

`controls.py` makes five small Git repos in one separate pinned container. Patch
construction uses explicit Git blob IDs, avoiding stat-cache shortcuts when tar
writes equal-length fixture text. Original upstream application commands run in
each repo; the cleanup observer records failure and leaves the repo untouched
until the controls container is removed. No failed tree is reused or tested.

Raw command outputs and B/T/M overlap-file copies remain in ignored `local/`.
Published evidence includes command output hashes, application observations,
`.rej` hunk headers/artifact hashes, complete conflicting hunk lists and original
patch references instead of duplicated full projects or patches. Hunk categories
are a fixed interpretation of these nine inspected cases, not a general patch
parser or merge engine. Binary, rename, copy, quoted-path and mode-change patches
are explicitly unsupported by the small inventory helper and fail closed; none
occurs in these nine cases.

Validate the published evidence and historical inputs without application runs:

```sh
local/polybench-pilot/venv/bin/python development/polybench-pilot/patch-contract/verify.py
```

A passed diagnostic control means its expected application outcome was observed,
including expected rejection. It never means that a historical conflict was
fixed, that implementation is correct, or that full CI passed.
