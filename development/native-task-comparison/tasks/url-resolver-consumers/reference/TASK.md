# url-resolver-consumers

Extend resolveLink(base,link) and buildMenu(base,items) to accept same-realm URL objects wherever base/link/item.href previously accepted a string. Keep returning absolute href strings using WHATWG URL resolution, not manual concatenation. Base must be a valid absolute http/https URL; resulting link must also use http/https; invalid types, invalid base or disallowed protocols throw TypeError. Relative strings resolve against base pathname, preserving standard query/fragment, dot-segment, percent-encoding, trailing-slash and scheme-relative behavior. A URL-object link is absolute and overrides base path. Do not mutate base/link objects or item arrays/records. buildMenu returns fresh {label,href} objects in order, preserving labels and propagating URL validation/errors. No network calls. Domain: string or genuine unmodified URL inputs, dense items arrays<=1000 with own stable label string/href fields, possibly frozen; no proxies/getters, URL subclasses, custom coercion or protocol-specific extensions. All URL parsing follows Node's installed WHATWG URL behavior; this task is not an extra percent-decoding or URL sanitization layer. Preserve existing string-only http/https behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert relative path/query/fragment behavior remains unchanged.
- Assert URL objects through buildMenu and original URL/item immutability.

Update project documentation to explain:
- Explain accepted URL/string forms and standard resolution/encoding behavior.
- Document protocol validation, consumer output and no mutation/network operations.

Run npm test after the last source or test change.
