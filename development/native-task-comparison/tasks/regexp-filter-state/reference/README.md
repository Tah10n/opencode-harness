# regexp-filter-state

filterNames accepts a literal case-sensitive substring string or native RegExp. Empty string matches all. Regex flags are preserved, but each name starts at index zero independently: global state never leaks and sticky matches must start at zero. Caller lastIndex is ignored for matching and never changed, including frozen regexes. The result is fresh and keeps order and duplicates; inputs are unchanged. Dense bounded string arrays and genuine native regexes are supported, not overridden protocols. Unsupported filters throw TypeError. Run npm test.
