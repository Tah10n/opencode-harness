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

For package-based `opencode-learning-guard` installs, prefer the smallest useful
plugin surface for each profile:

```js
export default async function learningPlugin({ client, $ }) {
  const mod = await import("opencode-learning-guard");

  return mod.default({
    client,
    $,
    toolset: "memory-read",
  });
}
```

Use the full self-improvement surface only on the bounded improver profile:

```js
export default async function learningPlugin({ client, $ }) {
  const mod = await import("opencode-learning-guard");

  return mod.default({
    client,
    $,
    toolset: "improver",
  });
}
```

When a host needs an even narrower mix, prefer an explicit allow-list:

```js
export default async function learningPlugin({ client, $ }) {
  const mod = await import("opencode-learning-guard");

  return mod.default({
    client,
    $,
    enabledTools: ["oc_learning_memory_list", "oc_learning_memory_add"],
  });
}
```

For memory cleanup without write access, expose audit with list:

```js
export default async function learningPlugin({ client, $ }) {
  const mod = await import("opencode-learning-guard");

  return mod.default({
    client,
    $,
    enabledTools: ["oc_learning_memory_list", "oc_learning_memory_audit"],
  });
}
```
