# central-money-rounding

roundRatio centralizes exact bounded integer rounding: nearest with half ties toward positive infinity, so -1/2=>+0 and -3/2=>-1; zeros normalize positive. taxCents and shareCents delegate here, retaining validation. Core numerator±1e15, denominator1..1e6. Amounts±1e9; tax rate0..100000 basis points, denominator10000; shares use0<=part<=whole<=1e6. Invalid bounds/types raise RangeError. invoiceTotal adds separately rounded line taxes, not one aggregate tax. Inputs remain unchanged; no floating-money or currency feature. Run npm test.
