# token-bucket-admission

Tokens refill continuously up to capacity. Rejected requests neither spend tokens nor invoke the gate handler. Retry delay rounds up in milliseconds; costs above capacity return null. Clock rollback is rejected without changing previous state.
