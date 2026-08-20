# Retry-time bounded repository context

Development-only component. The primary attempt remains unchanged. When a
medium task reaches an eligible failed-check retry, the host builds the same
bounded public repository map used by the earlier context experiment and
injects it alongside the current public diff. The map is limited to 20 public
files and 12,000 UTF-8 bytes and ranks entry points, imports, re-exports,
consumers, tests, config references, documentation contracts, and generated
boundaries.

No map is injected before the first mutation or for an ineligible retry. Hidden
files, hidden output, reference solutions, write-capable explorers, and private
paths remain unavailable. A required retry map that cannot be built fails
closed for the candidate lifecycle.
