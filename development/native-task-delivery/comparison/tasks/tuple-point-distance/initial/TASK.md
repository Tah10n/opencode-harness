# tuple-point-distance

Extend distance(a,b) and length(points) from {x,y} points to mixed dense numeric [x,y] tuples and records. Validate each coordinate finite number; tuple must have exactly2 entries, TypeError("point") for bad length/nonfinite/string coordinates. Record domain always own x/y; extra fields ignored. length sums Euclidean distances of adjacent points, empty0, singleton still validates. Use Math.hypot, no rounding. Never mutate/frozen inputs. Domain <=1000 points with magnitude<=1e6, ordinary records/arrays; no geographic interpretation.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- mixed tuples through polyline length
- singleton validation and immutable inputs

Update project documentation to explain:
- Explain mixed record/tuple inputs, exact tuple length and finite coordinates, validated singleton and Euclidean semantics.

Run npm test after the last source or test change.
