# Lazy pagination
iterateItems is lazy: fetch begins on advancement, and early break avoids the next page. listItems remains an eager array promise. exportNames forwards options. Both propagate cancellation via the exact signal and check before fetch/yield. Invalid/repeated cursors throw TypeError. Run npm test.
