# Persist and synchronize the existing background preferences

The portfolio already lets visitors choose a background variant (signal, topography, radar) and color theme (acid, plasma, ice). Replace the two separate writes with one versioned preference record and keep open tabs synchronized. Keep the existing controls and visual design.

New selections must persist both current values under localStorage key `tahion.visual.preferences` as a JSON object with version: 1, variant and theme fields. A complete valid current record takes precedence when loading. If the new key is absent, read the old raw-string keys `tahion.backdrop.variant` and `tahion.backdrop.theme`, preserving each valid old choice and defaulting an absent/invalid field independently to signal or acid. If at least one legacy field is valid, migrate the combined result to the new record; never remove or rewrite the old keys. Migration must be safe to repeat.

If a present new record is malformed, has an unknown version or an unsupported field value, use both defaults without overwriting that record on page load. Missing data gives the defaults without a startup write. Storage reads/writes may throw: the page must still render and in-memory controls must work. Do not mutate unrelated storage.

Clicking either existing control immediately updates its active button, the ShaderBackdrop's corresponding value and (for theme) document.documentElement.dataset.siteTheme. Save both current choices together, preserving the other choice. Reload must restore both. Repeated selections must remain safe.

Listen for storage events from this origin's localStorage for the new key. A complete valid record updates both controls, the actual backdrop and document theme. A removed key resets both defaults. Invalid events, unrelated keys and other storage areas do nothing. Do not write back in response to an event, and remove the listener on unmount. A local selection after a remote update must preserve the latest other field, not a stale initial value.

Deliver project regressions covering old valid inputs and migration, current record precedence, malformed/unsupported data, blocked storage, selection -> saved record -> reload, both consumer fields, and remote updates/removal/irrelevant events without write-back or stale-field loss. A deterministic storage/event adapter or a real browser is acceptable; no particular helper, assertion style or architecture is required. The real App controls and ShaderBackdrop must use the behavior, not an unused helper.

Add a normal `npm test` entry using Node's built-in test runner (TypeScript stripping is available in the provided Node), include it in `npm run check`, keep TypeScript/build/lint/format checks working, and document the record, migration and synchronization. No new dependency is needed. Preserve rendering, canvas fallback, navigation, existing content, and GitHub Pages base path. Run `npm run check` after the final change.
