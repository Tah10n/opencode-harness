# Prompt: Generate Project `WORKFLOW.md`

Use this prompt with an implementation or exploration agent when you want a project-specific `WORKFLOW.md` drafted from the actual repository.

```text
You need to draft a project-specific WORKFLOW.md for this repository.

Context:
- Global OpenCode rules already exist and must not be duplicated.
- WORKFLOW.md is a lightweight repo-owned execution contract inspired by Symphony, but without daemon/polling/runtime scheduler behavior.
- The goal is to help the orchestrator agent work correctly in this specific project.

Task:
1. Inspect the repository read-only.
2. Identify:
   - project type and primary entry points;
   - package/build/test/lint commands;
   - architecture layers and ownership boundaries;
   - test locations;
   - commands that are safe for frequent verification;
   - operations that require caution;
   - existing CONTRIBUTING/README/AGENTS/project skills, if present.
3. Draft a compact WORKFLOW.md.

WORKFLOW.md requirements:
- Write in the language already used by the project's documentation; if unclear, use English.
- Do not duplicate global OpenCode rules.
- Do not invent commands. Use only commands found in repo metadata or documentation.
- If a command is inferred or uncertain, mark it as "verify before use".
- Do not include secrets, tokens, machine-specific absolute paths, or private data.
- Keep the file short and practically useful.
- Include these sections:
  - Project Overview
  - Working Rules
  - Agent Delegation
  - Build/Test/Verification
  - Safety Notes
  - Definition of Done
- In Agent Delegation, describe when to use:
  - @explore
  - @architect
  - @general
  - @reviewer
  - @diagnose
  - @researcher
- For verification, specify narrow checks first and broad checks second.
- If the project is small, do not overbuild the workflow.

Output:
1. First provide a brief summary of the discovered context.
2. Then provide the full proposed WORKFLOW.md in a markdown code block.
3. Then list any unknowns or commands that a human should confirm.
4. Do not edit files unless you are explicitly asked to apply the changes.
```
