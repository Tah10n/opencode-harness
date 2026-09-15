# incremental-line-index

Offsets and columns count UTF-16 units. Normalize CRLF/CR to LF, including replacement independently before half-open splicing. LF belongs to its preceding line at content length; the following position starts the next line. A trailing LF creates an empty final line. Invalid coordinates throw RangeError without changing text. Surrogate-splitting edits remain supported; rebuilding the index is allowed.
