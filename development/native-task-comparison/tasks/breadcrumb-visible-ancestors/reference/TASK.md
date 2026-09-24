# breadcrumb-visible-ancestors

Integrate forest traversal and accessible breadcrumb records. findTrail(nodes,id) returns root-to-target node references, including hidden nodes, or null when absent. breadcrumbs(nodes,id) returns [] for absent target; otherwise remove hidden ancestors from the trail, but always include the target even when hidden. Every output record is {id,label,href,current}. Visible ancestors retain their href and current:false; the target retains its label, has href:null and current:true. Do not change labels or invent links for skipped ancestors. Domain: acyclic dense forest of at most 100 depth, unique nonempty ASCII IDs, each node has string label/href, boolean hidden and children array; labels are opaque plain text, not HTML. Do not mutate the forest; breadcrumb records must be detached from nodes. Preserve a visible single-root breadcrumb.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Hidden ancestor is omitted but a hidden current node is retained without a link.
- Unknown target yields empty breadcrumbs.

Update project documentation to explain:
- Traversal includes hidden nodes; filtering only hides ancestors.
- Current-node null link and plain labels, missing targets and input preservation.

Run npm test after the last source or test change.
