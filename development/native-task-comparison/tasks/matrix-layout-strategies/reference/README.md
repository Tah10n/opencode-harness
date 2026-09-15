# matrix-layout-strategies

cellOrder returns row-major or column-major fresh [row,col] coordinates, dimensions1..50 integer and invalid mode/dimension TypeError even when empty. layout uses one first-fit rectangle policy per input item, scan from start each time, fill whole span, never overlap/rotate/backtrack. Unique ASCII-letter IDs, positive w/h within dimensions,<=100 items. First unplaceable RangeError('cannot place ID'), input unchanged. Fresh independent grid rows contain id/null. renderLayout uses '.' nulls, space-separated cells, LF rows, no trailing LF. Run npm test.
