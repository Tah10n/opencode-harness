# draft-three-way-merge

Merge each top-level field atomically: equal sides win, otherwise the side changed from base wins; divergent changes conflict. Structural equality ignores record order but preserves array order. Missing and null differ. Conflicted fields are omitted from merged and reported in sorted presence-aware states. All emitted values are deep copies.
