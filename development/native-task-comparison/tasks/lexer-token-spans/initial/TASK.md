# lexer-token-spans

Extract existing arithmetic lexer into src/lexer.mjs exporting tokenize(source), and have existing evaluate(source) in src/evaluate.mjs consume it. Preserve the existing grammar and eager lexing error order. Grammar: decimal digit runs (leading zero allowed), binary + - *, parentheses; multiplication precedes left-associative addition/subtraction. No unary operators. Only ASCII space/tab/CR/LF is whitespace. Public tokens are fresh plain records {kind,value,start,end}: number value is Number(digit run), operator kind/value is its character, spans are half-open original UTF16 offsets; finish with eof value null and start=end=source.length. Tokenize is lexing only and allows token sequences that parser rejects. Reject non-string source with TypeError. Lex all characters before parsing; invalid character SyntaxError message is 'Unexpected character at N'. Preserve parser errors 'Expected expression at N', 'Expected ) at N', and 'Unexpected token at N' using current token start, including eof. Do not retain a second lexer in evaluator. Domain: strings<=2000 UTF16 units, valid number literals<=1000000, parentheses depth<=100, arithmetic intermediate/results within safe integers; any unrecognized characters are lexical errors. No eval/Function execution of input.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert number/operator/eof spans across original whitespace and leading zeroes.
- Assert precedence, associativity and exact lexical/parser failure positions.

Update project documentation to explain:
- Document public token shape, UTF16 span convention and limited grammar.
- Explain eager lexical errors before parsing and unchanged evaluator.

Run npm test after the last source or test change.
