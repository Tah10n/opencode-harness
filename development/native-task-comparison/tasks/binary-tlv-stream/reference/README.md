# binary-tlv-stream

Records use a one-byte type and two-byte big-endian payload length. Type 0 is reserved; payload length must be <=65535, including zero. push buffers fragments and emits complete records transactionally; a reserved complete header leaves previous pending bytes untouched. finish rejects truncation without clearing state. Inputs are snapshotted and returned payloads detached.
