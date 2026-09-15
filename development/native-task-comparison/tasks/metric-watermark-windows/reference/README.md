# metric-watermark-windows

Events aggregate into half-open windows grouped by key. advance closes windows whose end is at or below its monotone watermark, emitting sorted start/key records once. An older event remains admissible in an unclosed window. Decreasing watermarks throw without state change. Instances are independent.
