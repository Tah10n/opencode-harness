# observed-remove-set

Addition tags identify one value. Removal tombstones only locally observed tags, so unseen concurrent additions survive. Merge unions both sets, validates conflicts atomically and retains tombstones even before the add arrives. Snapshots are detached and sorted; tombstoned additions are retained.
