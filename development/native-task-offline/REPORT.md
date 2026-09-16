# Explicit offline native task run

The selected offline build configuration removes webfetch from actual native
parent and author requests and completes the checked local path to a portable
patch. This is configuration-only preparation, not webfetch-error recovery.
No `lib/` source, native transport, cancellation ordering, ordinary core default,
historical inputs/results, or model authorization is changed.

## Configuration and supported boundary

[build.json](build.json) is a per-process `OPENCODE_CONFIG_CONTENT` override:

```json
{
  "permission": { "webfetch": "deny" },
  "agent": { "build": { "permission": { "webfetch": "deny" } } }
}
```

The first deny alone is insufficient: installed 1.18.26 resolves the selected
agent's explicit allow after the general deny. The second deny narrows only
webfetch at that native level. OpenCode merges the other permission entries;
read deny/ask, external_directory ask and existing Bash permissions remain.
Native debug resolution also checks repeat application and restoration when the
per-process override is removed. The materializer is reused unchanged; no new
runtime flag, tool, proxy, hook-based schema filter or preparation framework exists.

The [launch recipe](../../docs/native-task/OFFLINE.md) supports a fresh `build`
session with no custom session permission overrides. Existing inline config is
rejected rather than overwritten. Selected-agent resolution is inspected before
running the command. Custom session permissions outrank agent configuration and
are unsupported by this preparation: the API regression creates a conflicting
parent, rejects it before any provider request, then uses a fresh empty-permission
parent. The actual child retains only the existing recursive task denials.
The JSON file by itself is not a guard against callers later injecting custom
session permissions or changing agents/configuration.

## Installed evidence

[installed.json](installed.json) records safe resolved permissions, parent/child
IDs, every task request's raw-body SHA-256 and complete tool list, actual command
exit/output hashes and times, bundle hashes, termination state and portable-file
bytes/modes. Raw HTTP request bodies and unchanged patches stay in ignored
`local/native-task-offline-integration/`. No authorization headers, credentials,
personal config or dependency tree is published.

The existing Linux image is pinned to
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`,
with `--network none`, a read-only root/source, loopback-only scripted provider
and HTTP target, and existing prepared dependencies. OpenCode 1.18.26 binary
SHA-256 is `096d32aa9778f98981390a0602c1f8af55ee5f1d6d5c58206f8fb2743c90eafe`.
The test uses direct with all optional components off, including TYPE_COMPAT,
command hints, context/checks, sensitivity, investigation and extra attention.

| Scenario | Author requests | webfetch HTTP | Local checks | Unchanged patch in ordinary clone |
| --- | ---: | ---: | --- | --- |
| Offline, first sequential run | 7 | 0 | pass | pass |
| Ordinary, subsequent independent run | 8 | 1 | pass | pass |
| Offline, concurrent configuration | 7 | 0 | pass | pass |
| Ordinary, concurrent configuration | 8 | 1 | pass | pass |

Each parent sends two task requests. Each run also sends one scripted title
request without tools; these are included in total request counts but are not
mislabelled author requests. All subsequent author requests after tool results
are included, rather than checking only the initial schema.

| Role | Offline inventory | Ordinary difference |
| --- | --- | --- |
| Parent | bash, edit, glob, grep, harness_task, question, read, skill, task, todowrite, write | adds webfetch only |
| Author | bash, edit, glob, grep, question, read, skill, todowrite, write | adds webfetch only |

There are no other dedicated network tools in these observed inventories. Bash
and installed plugins are not made universally network-safe by this permission.
OS isolation remains necessary; this is not an audit of arbitrary plugins/MCP.

Each author reads local source, changes implementation and its public test,
runs real `npm test` and `git diff --check` after the last edit, and finishes
with native `step-finish: stop`. All terminal tools are completed. Every result
has `checks_passed`, verified termination, zero abort requests and no queued,
pending or active tools. Original checkout and index are unchanged. The terminal
patch changes only implementation/test, contains no fixture configuration or
internal harness paths, and applies unchanged in an ordinary clone. That clone
passes the same checks with exact expected bytes and preserved 0755/0644 modes.
The ordinary controls fetch actual expected page content before local work.

## Checks and limits

Reproduce with `node scripts/run-native-task-offline-installed.mjs`. It also runs
installed `verify-native-template-config.mjs --offline` and `--review` before the
four task scenarios. The final run follows the last changes to fixture/config
code and verifies all materialized runtime module hashes against source.
An earlier four-scenario development run also passed; its local artifacts are
retained under `local/native-task-offline-integration/initial/`.

Local checks: `node scripts/verify-native-template.mjs` and
`node scripts/verify-native-task.mjs` (including command observations,
native lifecycle/permissions/queue controls and check-first). Syntax checks and
`git diff --check` cover the changed scripts and final diff. These are targeted
local/installed results, not a full aggregate or platform CI pass.
Historical `PROCESS_CONTAINMENT_UNAVAILABLE` was not investigated or bypassed.

The prior [policy-denial and ordinary-error evidence](../native-webfetch-lifecycle/REPORT.md)
is reused unchanged. Streaming/challenge cases were not rerun. No absent-tool
call was forced, and no error-to-patch continuation is claimed. The established
unverified-network-settlement stop remains in ordinary mode.

This scope supports tasks fully specified by local inputs, not work requiring
fresh external information or unavailable documentation. There is no automatic
task classifier or silent requirement reduction. Real research-provider calls,
Luna runs, probes, benchmarks and paid reviewers: **0**. Calls by the current
development assistant are separate. Scripted execution proves this path's
mechanics, not model quality or recovery of historical A attempts.
