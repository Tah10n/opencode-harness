# seat-reservation-snapshot

## Supported contract

Upgrade createSeats(initial=[]) to return reserve(seats), release(seats), snapshot(). Domain integer seat IDs0..9999; initial unique IDs; requested arrays may contain duplicates and may be frozen. reserve is atomic: if any requested ID is already reserved or duplicated within the request return false and reserve none; otherwise reserve all and return true, including empty request. release is idempotent and removes listed IDs. snapshot returns a fresh numerically sorted array reusable as initial to restore independent state. Input arrays and returned snapshots cannot mutate internal state. No persistence service/concurrency.

Run `npm test` for the preserved legacy and new project regressions.
