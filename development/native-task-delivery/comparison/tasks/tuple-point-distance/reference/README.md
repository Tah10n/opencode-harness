# tuple-point-distance

## Supported contract

Extend distance(a,b) and length(points) from {x,y} points to mixed dense numeric [x,y] tuples and records. Validate each coordinate finite number; tuple must have exactly2 entries, TypeError("point") for bad length/nonfinite/string coordinates. Record domain always own x/y; extra fields ignored. length sums Euclidean distances of adjacent points, empty0, singleton still validates. Use Math.hypot, no rounding. Never mutate/frozen inputs. Domain <=1000 points with magnitude<=1e6, ordinary records/arrays; no geographic interpretation.

Run `npm test` for the preserved legacy and new project regressions.
