# text-diff-patch-state

Hunks use original line-array coordinates and exact expected removal content. Require nonoverlap in supplied order; multiple zero-removal insertions at one position retain order. Invalid ranges throw RangeError, context mismatch Error("conflict"). Inputs remain unchanged. Inverse hunks address the resulting array, including same-position insertions after adjacent deletions. No minimization or unified-diff parsing is required.
