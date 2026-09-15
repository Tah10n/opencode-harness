# luhn-checksum-core

## Supported contract

Extract validDigits(text) into src/luhn.mjs and delegate describe(text) in src/describe.mjs. validDigits accepts nonempty ASCII digits only, then standard Luhn checksum: from rightmost check digit leave first unchanged, double every second leftward and subtract9 if doubled>9; sum divisible10. No length/card-brand restrictions; all-zero strings are valid. Other strings return false, no stripping separators/whitespace or Unicode digit normalization. describe returns {valid,masked}, mask all but last4 UTF16 units with *, preserving input exactly in suffix; invalid input still masked same way. Domain strings<=10000. Pure stateless core, no I/O/payment/network, no duplicate checksum in consumer.

Run `npm test` for the preserved legacy and new project regressions.
