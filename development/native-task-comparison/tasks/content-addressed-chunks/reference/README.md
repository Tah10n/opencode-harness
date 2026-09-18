# content-addressed-chunks

Split visible bytes into fixed chunks, hash each with SHA-256, and expose one logical chunk per hash. Refs count every manifest occurrence, including repeats in one file. Replacement/removal release old occurrences and remove unreferenced chunks. Empty files have empty manifests and differ from absent names. Inputs, readback and stats are detached; physical storage layout is unrestricted.
