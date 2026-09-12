# sparse-grid-persistence

Coordinates are integers in [-1000,1000], with -0 normalized to 0. Entries sort numerically by row/column. Values are detached JSON data; has distinguishes stored null from absence. Persist an array of exact row/column/value cells. restore replaces state only after parsing and validating every cell and uniqueness; SyntaxError or TypeError leaves old data intact.
