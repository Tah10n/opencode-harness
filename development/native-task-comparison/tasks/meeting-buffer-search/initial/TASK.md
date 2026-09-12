# meeting-buffer-search

Extend findMeeting(rooms,start,duration,buffer=0) in src/meeting.mjs to find the earliest integer-minute start >= start where every room is free for duration. Each room is an array of half-open reservations [a,b). Expand each reservation by buffer on both sides. A meeting ending exactly at a blocked start, or starting at a blocked end, is allowed. Input reservations may overlap or be unsorted. Keep interval helpers in src/intervals.mjs usable and do not mutate any input. Domain: finite integer minutes, a<b, duration>0, buffer>=0, safe arithmetic. No upper horizon.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- An unsorted multi-room case with cleaning buffers.
- A meeting that exactly touches a reservation boundary.

Update project documentation to explain:
- Half-open intervals and common availability across all rooms.
- Symmetric buffer expansion and earliest-start semantics.

Run npm test after the last source or test change.
