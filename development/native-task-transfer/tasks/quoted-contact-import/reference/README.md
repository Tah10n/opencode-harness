# quoted-contact-import

# Support quoted CSV and header-driven contact import
Retain parseRows(text) in src/csv.mjs and importContacts(text) in src/contacts.mjs; inputs are strings. parseRows returns arrays of string fields, preserving whitespace and Unicode. Empty input returns []. Comma separates fields; LF or CRLF separates records. One trailing record terminator adds no extra row, but an explicit blank record is ['']. Preserve empty fields including a trailing comma.
A field may start with a double quote only at its first character. Quoted fields allow commas and line breaks; double double-quotes represent one quote. After a closing quote, only comma, record terminator or end is legal. Unclosed quotes, a quote inside an unquoted field, or bare CR outside quotes throw SyntaxError. Inside quotes preserve CR/LF literally. No whitespace trimming or backslash escaping.
importContacts uses the first row as case-sensitive headers, requiring unique headers including name and email. Other columns are allowed and ignored. Every data row must match header width; bad headers or widths throw TypeError. Return {name,email} objects in row order with values verbatim, using header positions rather than fixed indexes. Empty input returns []; header-only valid input returns []. Malformed CSV errors propagate.
Add project tests for escaped quote/comma/newline values, reordered headers with ignored columns, and malformed quoting/row width. Keep the old simple CSV case. Document grammar and header/error behavior in README.md.

Use the existing Node built-ins and public exports. Keep old project tests and behavior. Do not add dependencies. Run npm test after the last change.
