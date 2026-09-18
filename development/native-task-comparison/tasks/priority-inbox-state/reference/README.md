# priority-inbox-state

Ready means readyAt<=supplied now. Order by descending priority then original sequence; priority/defer edits do not renumber. Duplicate pending IDs reject without consuming a sequence; claimed IDs may be reused with a new one. Payloads and results are detached. Restore preserves nextSequence gaps and validates IDs/sequences/bounds before replacement. No system clock is read.

IDs are nonempty ASCII strings; payloads are ordinary acyclic JSON data without custom methods or unsupported values. Enqueue calls stay below the safe nextSequence increment bound. A MAX_SAFE_INTEGER nextSequence can still be restored and inspected.
