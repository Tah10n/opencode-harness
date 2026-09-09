# lazy-file-manifest

Extract pure selectPaths(paths,exclude=[]) into src/selection.mjs; existing async buildManifest(root,paths,{exclude=[],fs=nativeFs}={}) in src/manifest.mjs delegates selection before any IO. Domain: absolute root; dense arrays<=10000 relative path strings<=500 units, no empty path/segments, leading/trailing slash, '.'/'..' segments, backslash or NUL; invalid path or exclude TypeError('path') before all IO even if that path would be excluded. No symbolic links in supplied filesystem fixtures. selectPaths deduplicates and sorts by default JS UTF16 order, excluding exact entries and descendants at slash boundaries (cache excludes cache/x, not cached/x). Preserve inputs. buildManifest calls injected fs.stat(path.join(root,relative)) serially in selected order; if stat.isFile() false skip reading; otherwise await fs.readFile then record {path:relative,bytes:actual visible byte length,sha256:lowercase SHA256}. fs methods retain their receiver; sync results or promises supported. Stop and reject exact first error, no later operations/retry. Empty selection no IO. Default node:fs/promises remains usable. No fs/IO in selection or duplicate filtering in adapter; no pre-reading excluded/duplicate/directory files. Filesystem stable during run; readFile yields Buffer/Uint8Array.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert exact/subtree exclusions versus sibling prefix, deduplication/order and invalid-path no-IO.
- Assert serial selected-only stat/read calls, directory skips, hashes and exact first-error stop.

Update project documentation to explain:
- Document relative-path domain, validation, sorting and exclusion boundaries.
- Explain injected/default fs, lazy selected-file reads and first-error behavior.

Run npm test after the last source or test change.
