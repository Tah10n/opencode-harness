# fragmented-message-decoder

Fragments are snapshotted and decoded only as complete UTF-8 messages, rejecting invalid bytes and preserving BOM. Pings emit detached pong bytes without altering a pending message. Invalid sequence, ping or UTF-8 throws RangeError and resets state; a fresh text message may then begin.
