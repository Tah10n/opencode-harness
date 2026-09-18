# portable-path-core

Extract normalizePosix(text) into src/posix-path.mjs and make existing src/cli.mjs run(args,write) delegate to it, preserving direct Node CLI operation. Core normalizes strings using POSIX slash semantics on every host: collapse repeated '/', remove '.', resolve '..' by popping a normal segment; relative leading '..' remain, absolute paths clamp at root. Backslash and drive-looking text are literal segment characters, never separators/drives. Empty relative result is '.', absolute root is '/'. Preserve a literal trailing input slash on non-root output (e.g. a/../ -> ./); do not add one merely because final component was '..' without slash. Reject non-string or NUL-containing paths with TypeError; other UTF16 text is literal. No cwd/filesystem access, realpath or platform-default normalization in core; explicit POSIX library routines are allowed. run requires exactly one argument: otherwise write exactly 'usage: path <value>\n' once and return2; success writes normalized+'\n' once and returns0. Normalization errors occur before output, writer errors propagate unchanged. Node CLI uses process argv and same exit/output behavior. Domain: path strings<=10000 units, ordinary args arrays/writer functions; no shell expansion or filesystem existence semantics. Preserve input arrays and old CLI interface; no parallel normalization implementation in CLI.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert relative/absolute dot segments, root clamping, trailing slash and literal backslashes.
- Assert actual Node CLI output/status and invalid-input no-write behavior.

Update project documentation to explain:
- Explain core string-only POSIX rules and host independence.
- Document CLI usage/status, trailing slash contract and absence of filesystem resolution.

Run npm test after the last source or test change.
