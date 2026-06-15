# Repository Roles

## opencode-recursive-context

Capability package for safe broad context inspection. It should remain
read-only and path-confined.

## opencode-learning-guard

Capability package for bounded writes to memory and managed skills. It should
remain a validator and writer, not a decision-making agent.

## opencode-harness

Behavior profile. This repo wires the capabilities into OpenCode agents,
permissions, skills, commands, and documentation.

The harness is where orchestration belongs.
