# bounded-lru-persistence

Entries are ordered least-to-most recent. get hits and put promote; peek/entries and misses do not. Evict the oldest on capacity overflow. Exported entries are detached; restore validates all duplicate keys before replacement/trimming and retains the newest capacity entries, preserving order.
