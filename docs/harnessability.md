# Harnessability Checklist

Use this checklist before adopting the harness into a project. It identifies
whether the project has enough structure for the harness to regulate agent work
with useful confidence.

## Minimum Readiness

| Area | Evidence to look for | Why it matters |
| --- | --- | --- |
| Project workflow | `WORKFLOW.md` or `.opencode/skills/project/SKILL.md` | Gives agents project-specific commands, safety notes, and conventions. |
| Fast verification | A test, typecheck, lint, or build command that can run locally | Provides cheap computational feedback before human review. |
| Clear boundaries | Modules, packages, API contracts, or architecture docs | Makes review scopes and architecture checks tractable. |
| Safe context access | Path-confined read-only tools or clear repository boundaries | Allows broad audits without dumping private or irrelevant files. |
| Local state boundary | Secrets, private memory, logs, caches, and machine paths are excluded | Keeps reusable harness files publishable and portable. |
| Review workflow | A defined review/fix/re-review loop | Prevents fresh open-ended reviews after each fix pass. |
| Verification ladder | Targeted, affected-module, full-suite, typecheck, lint, build, and specialized commands where applicable | Lets high/critical work produce reproducible evidence instead of vague confidence. |
| Trace boundary | Policy for local traces, logs, and transcripts | Keeps trace evidence useful without committing private machine-local artifacts. |

## Strong Harnessability

A project is strongly harnessable when it also has:

- deterministic checks that finish fast enough to run before each commit;
- architecture fitness checks for important boundaries;
- representative fixtures or approved examples for behaviour that tests cannot
  easily infer;
- project-local skills for recurring domain workflows;
- documented release and rollback steps;
- a clear policy for what agents may learn, persist, or ignore.
- static adversarial fixtures for prompt-injection, command-injection,
  secret-bait, and review-only traps that are safe and non-executable;
- evaluation corpus readiness: representative tasks, expected delegation
  behaviour, review examples, hidden checks, forbidden behaviours, scoring
  criteria, and acceptance thresholds for optional general live regression
  evaluation.

## Adoption Path

1. Add or update `WORKFLOW.md` with the project's commands and safety notes.
2. Add project-local skills only for recurring workflows that are not already
   covered by the global harness.
3. Provision the production process-containment boundary for the verification
   host. Windows uses the built-in Job Object controller; Linux and macOS must
   follow the corresponding `.github/workflows/verify.yml` cgroup-v2 or
   exclusive-UID provisioning contract.
4. Run `npm run verify` in this template before copying changes.
5. Copy the profile into the host OpenCode configuration.
6. Run `npm run verify:runtime` from this repository against the installed
   profile, or run the equivalent `opencode debug` commands manually.
7. Treat every repeated agent failure as a candidate for a new guide, a new
   deterministic sensor, or a project-local fixture.
