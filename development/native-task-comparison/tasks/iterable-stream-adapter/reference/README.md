# iterable-stream-adapter

collect accepts sync or async iterables (async preferred). Mapping is awaited sequentially with zero-based indices. The default limit is Infinity; nonnegative safe integers are allowed, and zero never acquires the source. Early limits close and await return without an extra next. Natural exhaustion does not close again. Source failures retain identity; mapper failures close and retain the original mapper error even if cleanup fails. Successful early-stop cleanup errors propagate. Sync yielded promises are awaited. Run npm test.
