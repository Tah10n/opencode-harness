# Catalog cache
loadCatalog(fetcher) returns the legacy array. With options it returns {status: "ok", items, etag} or {status: "not-modified", etag}. Region is URL-encoded. ETag matching is exact, not weak or wildcard. Run npm test.
