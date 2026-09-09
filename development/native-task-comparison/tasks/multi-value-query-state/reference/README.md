# multi-value-query-state

Retain ordered duplicate pairs and explicit empty values; bare keys parse as empty values and empty components are ignored. set replaces at the first occurrence, append goes last and delete removes all. Entries are detached. Canonical encoding uses + for spaces, uppercase UTF-8 escapes, and unescaped alphanumeric/*/-/./_; original spelling is not retained. Input encoding is valid UTF-8 with well-formed strings.
