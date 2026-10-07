Implement atomic batch commands and price-filtered export in this catalog mini-project.

`Catalog.applyBatch({expectedRevision, operations})` stages ordered `upsert`
({type:'upsert',product}) and `delete` ({type:'delete',id}) operations. Validate
every operation against the staged state. Missing delete, unknown operation,
invalid product or stale revision throws and leaves storage byte-for-byte
unchanged. expectedRevision must be a nonnegative safe integer; operations must
be an array. Use existing product validation and canonicalization. A valid
nonempty batch writes storage once and increments revision once; an empty batch
writes nothing and leaves revision unchanged (still check the revision). Return
an independent `{revision,products}` snapshot. Deleting then re-inserting an ID
puts it at the end; updating an existing ID preserves its position. Input values,
returned values and list results must not alias stored state. Storage write
errors propagate. A reopened Catalog uses the persisted revision and products.

`command(catalog,{action:'batch',expectedRevision,operations})` exposes exactly
the same operation. `action:'list'` supports inclusive minPrice (default 0) and
maxPrice (default Infinity), combined with tag filtering, in both existing JSON
and text formats. Reject nonnumeric/NaN bounds, a nonfinite or negative minimum,
and maxPrice below minPrice with RangeError. Preserve existing upsert shape,
unknown-field stripping, tag de-duplication, name/price errors, insertion order,
text formatting, default JSON and unknown-action/format errors. No dependencies.
Run `npm test`. Extend ordinary tests as needed; deliver all source changes.
