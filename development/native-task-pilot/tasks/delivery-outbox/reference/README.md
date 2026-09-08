# Durable outbox
Legacy arrays load read-only as v2. Only an exact acknowledgment ack === id removes a delivery. Failure increments attempts. Atomic persistence follows each attempt before the next send; persistence failure stops flush. Restart never resends delivered IDs. Run npm test.
