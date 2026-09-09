# image-transform-pipeline

Implement metadata-only image transformations through geometry(size,op) and transform(image,operations). Apply operations in order, using dimensions produced by each prior operation. rotate has turns in {0,1,2,3} clockwise quarter turns; odd turns swap width and height. crop has nonnegative integer x/y and positive integer width/height; require x+width<=current width and y+height<=current height, otherwise throw RangeError. fit has positive integer width/height bounds: scale by min(1,boundWidth/currentWidth,boundHeight/currentHeight), floor each scaled dimension independently, clamp each to at least 1. Never upscale. geometry returns only {width,height}; transform returns the image extra fields unchanged with final dimensions. Domain: positive integer dimensions/bounds <=10000, crop positions 0..10000, valid operation types and dense operation arrays; image is a plain own-data JSON record without cycles, special methods, undefined or nonfinite numbers. Do not mutate any input or nested extras. Identity is not part of the contract. Existing no-op metadata behavior must remain.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Ordered rotate/crop/fit with rounding.
- Crop rejection against dimensions after rotation.

Update project documentation to explain:
- Metadata-only ordered transformations, crop bounds and RangeError.
- Fit preserves aspect by a capped scale then floors/clamps dimensions; extra metadata preserved.

Run npm test after the last source or test change.
