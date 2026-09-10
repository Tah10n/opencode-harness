# luhn-checksum-core

Extract validDigits(text) into src/luhn.mjs and delegate describe(text) in src/describe.mjs. validDigits accepts nonempty ASCII digits only, then standard Luhn checksum: from rightmost check digit leave first unchanged, double every second leftward and subtract9 if doubled>9; sum divisible10. No length/card-brand restrictions; all-zero strings are valid. Other strings return false, no stripping separators/whitespace or Unicode digit normalization. describe returns {valid,masked}, mask all but last4 UTF16 units with *, preserving input exactly in suffix; invalid input still masked same way. Domain strings<=10000. Pure stateless core, no I/O/payment/network, no duplicate checksum in consumer.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- checksum parity and consumer mask
- strict input and zero allowed

Update project documentation to explain:
- Document strict ASCII input, Luhn parity, all-zero validity, masking even invalid strings and non-payment scope.

Run npm test after the last source or test change.
