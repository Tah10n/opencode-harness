# function-receiver-wrapper

timed forwards dynamic this and all arguments; returned and thrown values keep identity. Each invocation calls now before/after the body and emits one {duration,outcome} event before returning/rethrowing. duration is end minus start; outcome is return or throw. Timing is synchronous only: Promise returns retain identity without waiting or later events. now must be finite/monotonic/nonthrowing and record synchronous/nonthrowing. Repeated/nested invocations are independent. fn is not mutated. Constructor behavior and function metadata are not covered. Run npm test.
