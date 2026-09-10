# histogram-pure-core

## Supported contract

Extract counts(values) into src/counts.mjs, returning fresh {value,count} entries in first-occurrence order, and have summary(values) in src/summary.mjs use it. Values are dense string arrays<=10000, including empty strings, __proto__, constructor, commas. summary sorts entries by descending count then ascending default JS UTF16 value, returns {entries,total}, total original length. counts itself must NOT sort, summary must not mutate counts inputs/entry arrays owned elsewhere, and no shared mutable state. Input arrays may be frozen. Preserve exact old summary contract, no casefolding, object-key enumeration order or locale sort.

Run `npm test` for the preserved legacy and new project regressions.
