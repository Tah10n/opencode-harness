# Dual config
Both CommonJS require and ESM named/default configure accept a legacy mode string or {mode, indent}. Indent 0..8 overrides defaults, including zero. Invalid mode strings throw RangeError; missing mode or invalid shape/indent throws TypeError. Both render consumers forward either form. Run npm test.
