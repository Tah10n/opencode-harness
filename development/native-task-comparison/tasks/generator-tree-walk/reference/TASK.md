# generator-tree-walk

Add public lazy walkTree(root,{prune=()=>false}={}) in src/walk.mjs and implement existing collectTree in src/tree.mjs by collecting that iterator, preserving preorder and pruning semantics. Domain: null empty root or finite acyclic tree of node objects, ordinary dense children arrays or absent/null children,<=100000nodes/depth; nodes may have observable children getters but arrays/tree do not mutate during traversal. Yield actual node identity in preorder before calling prune or reading its children. On consumer resume after a yield, call prune(node) once; if truthy do not read children; otherwise read children once and traverse left-to-right. Constructing iterator performs no traversal; early return/break after yield does not call that node's prune/getter or later siblings. Propagate callback/getter throws exactly when resumed; no retries. Fully collecting calls prune also on leaf nodes. Avoid recursive JS calls so deep trees within domain work. collectTree is eager array result using this core and same supplied options; no separate traversal policy. Tree/payloads unmodified.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert preorder, pruning and node identities.
- Assert yield/resume side-effect timing, early close, thrown identity and a deeply nested tree without stack overflow.

Update project documentation to explain:
- Document lazy timing and pruning/children access ordering.
- Explain eager compatibility wrapper, stable-tree domain and depth safety.

Run npm test after the last source or test change.
