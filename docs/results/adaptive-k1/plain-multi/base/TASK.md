Extend mergeRanges(ranges, {joinAdjacent=false}={}) to optionally join touching
half-open integer intervals, while always merging overlapping ones. Preserve input
order and contents (do not mutate the argument). Keep validation: reject non-array
inputs, malformed pairs, non-finite/non-integer endpoints and start >= end.
Return a fresh sorted array of fresh pairs. Add your own tests and run the public
checks with `node --test`. No dependencies are needed.
