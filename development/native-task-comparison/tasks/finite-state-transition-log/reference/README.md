# finite-state-transition-log

Validate and freeze graph membership and unique transitions at construction. Applied IDs are idempotent for the same type; conflicting reuse rejects, while failed IDs remain unused. History is detached. Restore validates the complete chain and distinct IDs before replacing state/history/ID memory; empty history resets to the original start.
