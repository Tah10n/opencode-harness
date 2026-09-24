# markdown-heading-navigation

ATX headings outside triple-backtick fences produce navigation. ASCII slugs remove punctuation, collapse spaces, and use section when empty; repeated bases gain encounter-order numeric suffixes. The nearest previous lower-level heading is the parent, including across level jumps.

Supported headings start in column zero with 1..6 # characters and at least one ASCII space. Indentation or a tab replacing that separator is not a heading. Trim surrounding title whitespace and trailing # marks with surrounding spaces, even without a separator; omit empty titles. Lines beginning with optional whitespace and three backticks toggle a fence; fenced headings are ignored. LF and CRLF are supported. This is a limited grammar, not full CommonMark.

Slug steps: lowercase ASCII, remove characters except a-z/0-9/space/hyphen, trim and collapse spaces to hyphens; use section for an empty result. Repeated base slugs append -1, -2, and so on in encounter order.
