# casefold-command-aliases

Extend createCommands(entries) with aliases while preserving exact canonical command lookup. Each entry has name, run function, optional description (default empty string), optional aliases string array (default []). Names/aliases must match ASCII [A-Za-z_][A-Za-z0-9_-]*; invalid ones throw TypeError, including lookup input. Canonical names are case-sensitive and unique exactly (duplicate error code DUPLICATE_COMMAND); distinct A/a are allowed. Dispatch first matches exact canonical name, then compares aliases with ASCII case folding. Canonical names do not implicitly become case-insensitive aliases. An alias may overlap a canonical name: exact canonical always wins. Folded aliases may repeat for the same command, but collision between different commands rejects construction with code ALIAS_COLLISION. Unknown valid lookup throws code UNKNOWN_COMMAND. run(name,...args) invokes chosen handler once with original arguments and undefined thisArg under normal JavaScript rules, preserving exact return/throw identity without awaiting. help() returns fresh [{name,description,aliases}] in entry order, aliases preserving supplied spelling/order (including same-command duplicates). Snapshot routing/help inputs at construction without mutation; later input/returned-help changes do not affect it. Domain: <=1000 ordinary entries, stable own data fields, optional fields omitted/undefined, descriptions strings, callable handlers, frozen inputs allowed. No registration after construction, Unicode folding, fuzzy matching or command execution layer.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert exact canonical precedence over alias and ASCII-insensitive alias lookup.
- Assert collision refusal and preserved help/input ownership and order.

Update project documentation to explain:
- Explain exact names versus folded aliases and collision rules.
- Document handler forwarding, errors and help snapshot/order semantics.

Run npm test after the last source or test change.
