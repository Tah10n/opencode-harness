# visitor-expression-printer

Add general postorder visitExpression(node,visitor) in src/visitor.mjs, and refactor existing printExpression in src/printer.mjs to use it without a duplicate tree walk. Domain: finite acyclic expression trees<=10000 node occurrences/depth100, potentially shared nodes; literal {type:'literal',value} with nonnegative safe integer (excluding negative zero) or primitive Unicode string, binary {type:'binary',op,left,right} with op in + - * /. Strings may contain quotes, controls or isolated surrogates; stringify using JSON string literal semantics. Visit each occurrence left-to-right postorder, call visitor.literal(value) or visitor.binary(op,leftResult,rightResult) as methods with receiver visitor; pass results unchanged, do not cache shared occurrences. First thrown value propagates unchanged; no later visits. Printing preserves exact existing output: JSON.stringify literals; single spaces around binary ops; * / precedence above + -, all left-associative. Parenthesize lower-precedence child on either side and equal-precedence binary right child, never equal-precedence left child. This is minimal for reproducing the exact ordered parse tree, not algebraic simplification; even 1+(2+3) retains parentheses. No mutation of nodes/visitor and frozen nodes supported. No eval/Function.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert precedence, left/right associativity and JSON string escaping.
- Assert visitor order/receiver, shared-node occurrences and stopping at first thrown value.

Update project documentation to explain:
- Document visitor handlers/results/ordering and shared-node behavior.
- Explain exact-tree minimal parentheses and literal escaping.

Run npm test after the last source or test change.
