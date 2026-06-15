# Agent Tool Permission Example

Grant read-only recursive context tools only to agents that need broad
repository context:

```yaml
context_outline: allow
context_files: allow
context_search: allow
context_read: allow
```

Keep bounded memory and managed-skill write tools off the root profile. Expose
`oc_learning_*` only through the controlled self-improvement agent.
