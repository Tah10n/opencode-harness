# route-specificity-dispatch

Split paths before decoding each segment. Literal > parameter > wildcard; an exact route end wins over a wildcard continuation. Dispatch calls only the highest-ranked handler; ties keep registration order. A wildcard may capture zero segments. No match returns null.
