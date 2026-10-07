Add a streaming import path without replacing the existing text API and CLI.
This mini-project imports newline-separated inventory records {id,count}.

Keep synchronous parseText(text) exactly compatible: skip blank lines, accept
LF/CRLF and no final newline, strip unknown fields, require nonempty string IDs
and nonnegative safe integer counts. Preserve its original error classes.

Export async generator parseStream(chunks,{maxLineBytes=65536}={}), accepting an
async iterable of Buffer/Uint8Array chunks. Decode strict UTF-8 incrementally
(including characters split between chunks). Skip blank lines; handle CRLF split
across chunks and a final line without LF. Apply the same record validation.
Count physical lines from 1 including blank lines. JSON syntax errors are
SyntaxError and invalid records retain TypeError/RangeError, with 'line N:' in
the message. Reject invalid UTF-8/chunk types with TypeError. maxLineBytes is a
positive safe integer, otherwise RangeError. Count UTF-8 bytes per line excluding
LF and one terminal CR; an overlong line throws RangeError mentioning its line.
Enforce this while streaming, without buffering the complete input. The stream
may start with one UTF-8 BOM; consume it. Close the input iterator on errors or
consumer early exit, and never read beyond an early exit to complete the file.

importRecords(input,{format='text',maxLineBytes}={}) returns {records,total},
using parseText for text and parseStream for format:'stream'. Unknown formats
throw RangeError. total is the sum of validated counts; preserve record order.
The CLI `node bin/import.mjs FILE [--stream]` keeps the original text default and
adds --stream using fs.createReadStream. Print one JSON summary and newline on
success, only an error message on stderr with exit 1 on failure. Reject unknown
or repeated options. No dependencies or network. Run npm test.
