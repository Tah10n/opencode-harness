# radix-tree-edit-state

Updates return new immutable dictionary versions; old versions retain their contents. Duplicate initial keys keep the last value; missing deletion is harmless. Internal representation is unrestricted. Prefix results sort by ASCII key before applying a limit; empty prefix selects all. All input/output JSON values are detached snapshots.
