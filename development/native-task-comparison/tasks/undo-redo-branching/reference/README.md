# undo-redo-branching

History keeps at most limit prior states; every commit counts even if equal. Undo/redo transfer states, while a new commit clears the redo branch. Inputs and all returned JSON values are deep snapshots, so caller mutation cannot change history.
