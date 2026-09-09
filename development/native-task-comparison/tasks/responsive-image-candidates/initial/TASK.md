# responsive-image-candidates

Implement a deliberately limited srcset parser and responsive selector. parseCandidates(text) returns input-ordered {url,value,kind} records. Empty/whitespace-only input gives []; otherwise comma-separated candidates each contain a nonempty URL, one or more ASCII spaces, then an explicit positive number ending w or x, with optional outer whitespace. URLs are ASCII without commas or whitespace; numeric grammar is digits optionally followed by a decimal point and more digits, no signs/exponents. w values must be integer; x may be decimal. Throw TypeError for malformed candidates, nonpositive values, mixed w/x kinds, or duplicate numeric descriptor values (1x and 1.0x conflict). No implicit 1x and no data URLs. selectImage(text,cssWidth,dpr,fallback) uses target cssWidth*dpr for w and dpr for x; choose the smallest descriptor >= target, or largest if none reaches it; empty list uses fallback. Preserve parser input order, independent of selection sorting. Domain: finite strings under this grammar, malformed strings for rejection, positive finite cssWidth/dpr <=10000 and descriptor values <=10000. Preserve existing empty fallback behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Unsorted width candidates and density boundary selection.
- Mixed and numerically duplicate descriptor rejection.

Update project documentation to explain:
- Explicit simplified grammar and unsupported implicit/data URL forms.
- Selection target differs for width and density; largest and empty fallbacks.

Run npm test after the last source or test change.

Reject a URL beginning with data: in any ASCII letter case, as well as non-ASCII URL characters.
