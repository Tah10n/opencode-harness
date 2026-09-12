# validation-rule-combinators

allOf stops first failure and copies its errors, otherwise succeeds; empty AND succeeds. anyOf stops first success with empty errors; if all fail concatenates ordered errors; empty OR fails with empty errors. Fresh outputs, shallow error identities, no mutation, exact thrown values stop; synchronous rules receive one unchanged input/undefined thisArg. Stable dense rule arrays<=100/depth100. Profile uses AND name checks then OR email/phone; name required then length<=20, existing email regex (not full standards), 6..12-digit phone, ordered legacy messages. No trimming/extra validation. Run npm test.
 Error arrays/final combined output may contain up to 200000 values.
