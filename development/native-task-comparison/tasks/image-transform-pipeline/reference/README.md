# image-transform-pipeline

This library transforms metadata dimensions, not pixels. Operations execute in order. Crop bounds are checked against current dimensions and throw RangeError. Fit never upscales: use a shared capped scale, floor both dimensions and clamp each to 1. Extra metadata is preserved without mutating inputs.
