# markdown-heading-navigation

Implement headings(text), anchors(items) and toc(text). headings scans ATX levels 1..6 outside triple-backtick fenced blocks; strip surrounding heading whitespace and optional trailing # marks. anchors returns fresh heading records with IDs: lowercase ASCII title, remove everything except letters/digits/spaces/hyphens, trim, collapse spaces to hyphens; empty slug becomes section; repeated base slugs get -1,-2,... in encounter order. toc builds {level,title,id,children} nodes: parent is nearest previous lower-level heading, or root if none. Level jumps are allowed. Domain: ASCII, LF/CRLF, only the documented ATX/fence grammar; fences toggle on lines starting with optional whitespace and triple backticks. Preserve simple single heading output; do not mutate anchors input.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Headings inside a fence are excluded while following headings remain.
- Repeated anchors and hierarchy with a skipped heading level.

Update project documentation to explain:
- Supported ATX/fence grammar and ASCII slug algorithm.
- Nearest lower-level parent and duplicate suffix ordering.

Run npm test after the last source or test change.

Use this limited heading grammar, not full CommonMark: a heading begins in column zero with 1..6 # characters and at least one ASCII space. A tab instead of that space or any indentation is not a heading. Trim title whitespace and strip trailing # characters plus surrounding spaces even without a separating space; ignore headings whose resulting title is empty. Thus # title# and # title # both have title title; # followed only by spaces/# is ignored. A fence line starts with optional whitespace then three backticks and toggles fence state.
