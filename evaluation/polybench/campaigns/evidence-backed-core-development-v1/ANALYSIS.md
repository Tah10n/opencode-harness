# Historical evidence and H1 hypothesis

Written before changing candidate instructions or starting new model attempts.
Metadata classification is in historical-classification.json; ambiguous causes
remain unknown. The two campaign/product versions remain separate. Only the
two specified divergent tasks were deeply inspected; no confirmation task text,
code, gold, tests or outcomes was used.

## three.js-24461: implementation agreement, evaluator identity disagreement

The public task requests decimal saturation/lightness in HSL, gives an actual
Color constructor example, and points to the parser. All three attempts read
Color.js and existing Color tests, broadened the two percentage regex groups
and replaced parseInt with parseFloat. Their complete production-only diff is
identical: SHA-256
`107efece16f581847ae1e5e1477d26dc0f8a63917eed1a8414d3612dca2e41cf`
(848 bytes). Author project tests and lint passed in each mode. P/C added a new
QUnit test; T extended an existing test after reading the QUnit utilities.
No investigator ran for this T task. Native core bytes match the current C0;
P has stock OpenCode instructions, C has core, T additionally wraps a direct
author worktree. Original task bytes agree between P/C and the T author input.

All official full-M applications succeeded, and official logs ended with
`# fail 0` (P/C 719 passes, T 718). This is not an author/official patch-application
conflict. The official parser preserves TAP's numeric test prefix. Its dataset
F2P labels have prefixes 923/924; P/C's extra test before them produces 924/925.
T does not add a new test at that point and preserves 923/924. Consequently
official R is P=false, C=false, T=true despite identical production changes
and passing semantic assertions. Historical R/D remain unchanged. This
discrepancy supplies no implementation-quality causal hypothesis. Do not ban,
filter, relocate or remove author tests to exploit those evaluator identities.

## serverless-8159: requested scope versus a newly chosen interface

The public task says the application supports JSON and needs removal of the
undesired form-content default. It does not specify a null sentinel. Existing
public code exposes a map of per-content templates, seeds two defaults and merges
overrides. validate.js accepts an object and does not reject null-valued members;
compileMethods later calls replace on each emitted value. These facts were
available in the original project and were read by the authors; no hidden data
is needed to identify the per-member versus all-defaults distinction.

P adds per-member removal after the existing merge and a compileMethods test
that observes both absent form template and retained nonempty JSON template.
Its method and validation suites, formatting/lint and final diff checks pass;
official R=true. C instead documents/tests a new template=false input and gates
all defaults off. T documents/tests template={} and suppresses all defaults for
that input. C runs 232 broad API tests, T 224, with their own selected interfaces
and old preservation cases passing. Those green counts do not distinguish the
task's one-content-type removal from disabling all defaults. T asks the existing
investigator about competing configuration interpretations, but preparation
fails at the dependency-copy bound before any child model work or test patch.

All full M applications succeed. Official C/T reach the same concrete failure:
a null-valued content member remains in the emitted map, and compileMethods
throws on value.replace. P's removal prevents that downstream crash. This is a
behavior/input mismatch rather than test-patch application rejection. However,
the exact null representation is absent from the task, so matching that hidden
choice is not evidence that an ordinary agent was obliged to infer it. P's
visible, useful action is its SAME public-call observation of requested removal
and retained sibling, not access to the evaluator's sentinel or winning mode.

## Causal hypothesis and one proposed change

Observation: C/T execute broad green tests of their newly selected all-defaults
interfaces; P executes a public-caller scenario that removes one member while
retaining the needed sibling. Missing action: no comparable distinguishing
scenario connects C/T's chosen representation to the original requested scope.
Minimal change: revise core step 1 to use the task's concrete example, and for
a per-member change observe both that change and a relevant unselected member
in one public call before settling the input representation. This is a testable
hypothesis, not established causality from one task or reconstructed reasoning.

Current step 1 identifies outcomes/inputs/paths abstractly; step 2 says expected
values come from the task/public contract. Neither asks for this concrete paired
observation before the author's new representation becomes its own test premise.
Steps 2-6, tools, permissions, stateful sequence checks and task/review remain
unchanged. No hook, new artifact requirement, additional model stage or agent.

Positive control: a synthetic public configuration call removes a named item
while a required second item retains its value. The same distinguishing check
passes for scoped removal. Negative control: a broader replacement that removes
both satisfies an absence-only self-test but fails this public-call check. These
controls use no benchmark repository or hidden expected strings. The installed
local-provider scenario must receive exact materialized instructions, execute
both checks with independent assertions, and retain normal tools/denials.

Reject H1 if the six-task batch does not exceed BOTH fresh P/C0 in D, if no
substantive use of the distinguishing public scenario is recorded, if its gain
is only submission/parser interaction, or if preservation/safety is weakened.
Broader green suites or confident explanations alone do not support H1. If H1
fails, H2 is permitted only from a concrete new result; no accumulation of
unsupported changes. Statistical confirmation remains conditional and separate.

## Previously rejected approaches

The archived native-template DEVELOPMENT.md at 030b4ee2 explicitly contrasts
failed reminders/work-map experiments with a delivered project regression. The
active C0 already contains that regression/check-first loop, so H1 must not
restate it or resurrect a map/scheduling document. Archived direct-assertion-review
DECISION.md at the same source removes a 204-word clarification: its one pair
added no D and violated a retained contract. Archived legacy bounded-context,
reviewer and remediation decisions likewise do not justify new mandatory passes.
H1 changes one within-session observation at the public caller; it introduces
no pending-continuation state, extra review pass or historical product mode.
These old decisions are context, not pooled evidence or a fresh measurement.

## Evidence provenance

Published outcomes/predictions are unchanged in consolidated-remaining-v1.
Six exact native-evidence captures, their final provider requests and official
logs were selectively recovered (4,107,642 bytes) from private archive SHA-256
`1c3c667ae5384161f4f91af18ee7a5a0ec9dfd65a345bf94fc365fb5c5a1a227`.
Private recovery.json binds each member/size/hash. Analysis excludes reasoning
items and uses task/instruction text, observed reads/tool outputs, commands and
patches. Raw captures, personal paths and credentials are not public artifacts.
