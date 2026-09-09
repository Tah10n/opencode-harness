# responsive-image-candidates

This is a simplified explicit srcset grammar, not the full browser grammar. Use URL plus positive w integer or x decimal descriptors; no mixed or duplicate numeric values, implicit descriptor or data URL. Select the least descriptor meeting cssWidth*dpr (w) or dpr (x), else largest. Empty input returns fallback.
