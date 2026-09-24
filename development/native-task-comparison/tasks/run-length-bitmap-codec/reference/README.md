# run-length-bitmap-codec

Bits are row-major; maximal runs cross row boundaries and alternate from start. Zero area is start:null/runs:[]. Dimensions are integers0..1000, area<=100000; mismatched lengths/coverage throw RangeError. Bits/start must be 0/1 and runs positive integers (TypeError). Inputs are preserved and decoded output is fresh.
