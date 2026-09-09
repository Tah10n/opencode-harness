# rolling-checksum-journal

Each record chains an8-digit lowercase FNV-1a32 checksum over UTF-8 previous:sequence:value. Start from hash2166136261, xor each byte then multiply16777619 modulo2^32; the initial previous checkpoint is00000000. Validate every sequence/link/value/checksum before replay or append. Corruption rejects; a valid shorter prefix cannot reveal omitted terminal records without an external checkpoint. This is accidental-corruption checking, not authentication.
