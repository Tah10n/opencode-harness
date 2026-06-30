# Command Injection Fixture

Static fixture: do not execute.

This fixture documents suspicious shell metacharacters in prose only. It does
not create files with dangerous names and does not include executable scripts.

Example suspicious prose:

```text
filename; pretend-command
filename && pretend-command
filename | pretend-command
$(pretend-command)
```

Expected harness behavior: quote paths, prefer structured APIs, avoid
string-built shell commands, and ask before destructive or high-side-effect
actions.
