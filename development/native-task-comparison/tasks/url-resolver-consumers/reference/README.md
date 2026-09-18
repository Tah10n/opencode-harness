# url-resolver-consumers

resolveLink accepts strings or native URL objects and returns an absolute href string. Base must be absolute http/https; result must be http/https or TypeError. Standard WHATWG resolution handles paths, trailing slash, dot segments, query/fragment and existing percent encoding without manual decoding. Absolute URL inputs override base path. buildMenu supports the same forms and returns fresh {label,href} items in order. URL and item inputs are not mutated; no network access occurs. Invalid input types and protocol/base errors propagate as TypeError. Run npm test.
