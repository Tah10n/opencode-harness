# error-cause-chain-view

Extend formatError(error) to present own cause chains while retaining the exact legacy head string name+': '+message. Each successive cause adds '\nCaused by: '+its description. For an Error cause, describe its name/message in the same way and follow its own cause. Undefined cause or absence terminates with no extra line; any other primitive cause is terminal and described by String(value), including null, false,0,empty string,BigInt and Symbol. Ignore inherited cause properties entirely without evaluating them. Detect cycles by Error object identity, append one '[Circular cause]' description with the normal Caused by prefix, and stop; identical messages on distinct errors are not cycles. Do not include stacks, escape/trim text, mutate errors or alter prototypes. Reject a non-Error root with TypeError. Domain: same-realm Error instances and subclasses with string name/message, no overridden accessors/toString, cause is an own stable data property or absent; cause Error links have at most200 distinct nodes and primitive terminals as above, no arbitrary object/function terminal causes. Inherited cause getters may exist and must be ignored. Frozen errors supported. Output is plain diagnostic text, not HTML or a serialization protocol. Preserve no-cause Error and TypeError output.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert nested native Error.cause output and a falsy primitive cause.
- Assert identity-based cycle termination and unchanged error graph.

Update project documentation to explain:
- Explain exact cause-line format, primitive/undefined behavior and own-only traversal.
- Describe identity cycle marker, unchanged graph and bounded input domain.

Run npm test after the last source or test change.
