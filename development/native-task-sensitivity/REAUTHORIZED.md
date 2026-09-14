# Separately authorized second diagnostic series

After the eight recorded startup failures and the publication of `5b5464c9`,
the user explicitly authorized a further model series. This authorizes eight
new independent attempts on the same four inputs and the same pre-result rubric.
The original eight results remain failures and are neither replaced nor renamed.

The component is unchanged from `5b5464c9`; its materializer includes the
read-only startup correction. Before freezing, preparation must run the scripted
H1 installed preflight against the exact new bundle with `/template` mounted
read-only, verify normal native completion and termination, and prove the bundle
was not modified. This fixture makes zero real provider requests.

The new private root is `local/native-sensitivity/diagnostic-authorized-2`.
Same cases, seed patches, original tasks, dependencies, H0/H1 balanced order,
OpenCode 1.18.26, Luna/high and 900-second task deadline as the first series.
A/B remain disabled. Only H1 enables sensitivity. No runtime amendment after
the freeze, no retry/replacement, no extra real smoke, no historical Q/D rewrite.
Existing unknown-submission, quota, authorization and termination stop rules
remain in force. Neither the old H00 pause nor its slots 43–48 may be changed.

This consumes the eight newly authorized starts, bringing this stage to at
most sixteen starts including the original failures. No further P/H transfer
run is authorized by this amendment. Report the original conditional gate as
an observation; if it passes, retain the candidate for a separately authorized
evaluation instead of extending the run count automatically.
