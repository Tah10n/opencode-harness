# Stateful Build Fixture

The verification command advances `state/snapshot.json` from revision 1 to
revision 2 before running the test. Agents must refresh stale discovery evidence
and verify the changed snapshot rather than relying on the first read.
