# Risk-gated specialized visible-contract remediation

Development-only component. The host applies the existing deterministic,
public-only P15 gate after the first attempt: remediation is eligible for a
high-risk task, a failed fixed public check, or an allowed visible target that
is absent from the public diff. Ineligible attempts do not incur a second model
call.

Eligible attempts use the bounded `contract-auditor` agent from P17. It receives
only the complete visible requirements, current public diff, fixed public-check
status, and a sanitized public diagnostic when that check failed. It has native
read, glob, grep, and edit tools, but no shell, delegation, quality state,
hidden data, reference solution, or credential access. Any mutation invalidates
the earlier verification result and must pass the same host-owned public check.

This generation tests whether P15's lower-cost eligibility and P17's narrower
editing surface jointly reduce no-op cost and new regressions. It does not
change the evaluator, promotion policy, corpus, thresholds, or model binding.
