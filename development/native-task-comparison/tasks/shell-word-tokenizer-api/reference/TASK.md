# shell-word-tokenizer-api

Extend words(text) from whitespace splitting to a literal word tokenizer with this exact local grammar. Outside quotes, ASCII space/tab/CR/LF separate words; other whitespace stays literal. Single and double quote delimiters are removed and adjacent quoted/unquoted segments concatenate into one word. A quoted empty segment creates a word even when it has no characters. Inside single quotes every character except closing single quote is literal, including backslash and double quote. Outside single quotes, backslash consumes the next UTF-16 code unit and appends it literally, including quotes, spaces, backslash or a newline; there is no line-continuation deletion. Inside double quotes only closing double quote and this backslash rule are special. Unclosed quotes or a dangling applicable backslash throw SyntaxError without returning partial tokens. All metacharacters ($,;,|,<,>,*,?,# etc.) are ordinary data: no expansion, comments, command parsing or execution. Domain: strings<=10000 UTF-16 units, including Unicode/lone surrogates; no non-string coercion. Calls are independent. Preserve legacy ASCII-whitespace word splitting for inputs without quotes/backslashes.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert quoted/unquoted concatenation and preserved empty quoted words.
- Assert single/double escape differences and SyntaxError for malformed input.

Update project documentation to explain:
- Document exact delimiter/backslash grammar, including escaped newline and non-ASCII whitespace.
- State no shell execution/expansion/comments and malformed-input behavior.

Run npm test after the last source or test change.
