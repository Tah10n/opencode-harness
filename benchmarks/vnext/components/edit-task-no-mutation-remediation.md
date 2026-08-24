# Edit-task no-mutation remediation

The host treats a completed first attempt with no workspace mutation as
incomplete when the runner-owned task scope is `edit`. It starts at most one
bounded continuation using only visible requirements, public repository
content, and the fixed runner-selected check. If that continuation mutates the
workspace, the ordinary post-last-mutation verification gate becomes stale and
must run before terminal success. Read-only tasks and edit tasks that already
mutated do not trigger this mechanism.
