# tree-selection-propagation

Only leaves are selected. A parent is checked when every descendant leaf is selected, indeterminate when only some are. Toggling any node updates its descendant leaves. Initial topology is frozen independently of caller mutation. Snapshots are detached/sorted; restore accepts duplicate leaves but validates unknown/nonleaf IDs atomically.
