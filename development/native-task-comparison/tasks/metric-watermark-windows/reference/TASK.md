# metric-watermark-windows

Implement grouped tumbling event-time metrics. windowStart(time,width)=floor(time/width)*width and summarize(key,start,width,values) returns {key,start,end:start+width,count,sum}. createMetrics(width) starts with watermark 0. add({time,key,value}) assigns a half-open window, returning false without adding when window end<=watermark; otherwise returns true and adds to that key/window. Events older than the watermark are still accepted when their window is not closed. advance(next) rejects decreasing watermarks with RangeError without state change, otherwise sets watermark and emits/removes all nonempty windows with end<=next. Return records sorted by start then key using ASCII lexicographic ordering, one per key/window. Repeating a watermark does not re-emit. Domain: positive integer width, nonnegative integer times/watermarks, arbitrary ASCII keys including empty and prototype-like names, integer values and safe integer arithmetic. Keep independent instances and do not mutate event inputs. Preserve empty flush results.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Out-of-order event accepted before its window closes and rejected after closure.
- Repeated flush emits nothing; decreasing watermark rejects without corrupting queued data.

Update project documentation to explain:
- Half-open windows, close-at-end watermark boundary and sorted grouping.
- Late rejection is based on closed window; monotone watermark and independent instances.

Run npm test after the last source or test change.
