# document-backup

# Recover autosaved documents without destroying the previous copy
Keep load(file), save(file,value) in src/documents.mjs. Valid document JSON is a non-null object (not array) with string text; unknown JSON fields must be retained. Invalid parsed shapes throw TypeError. Do not change callers' objects.
load first reads/parses/validates primary. On any primary read/parse/validation error, try file+'.bak'. If backup is valid return it, without writing either file. If backup also fails, rethrow the original primary error (including its filesystem code or SyntaxError/TypeError), not the backup error. A valid primary always wins.
save validates and serializes the supplied value before changing any files. For an existing valid primary, preserve its exact original bytes at file+'.bak', then replace primary using a sibling temporary file and rename. First save with absent primary creates primary and leaves any preexisting backup untouched. Existing corrupt primary must cause save to throw and leave primary and backup unchanged; do not silently repair it. Invalid or unserializable new input must leave both unchanged. Clean up your temporary file. No concurrent writers or injected filesystem-write failures are required; do not promise a two-file transaction on power loss.
Add project tests for read-only fallback from corrupt primary, byte-exact previous backup after two saves, and invalid save preserving both files. Document recovery priority, rejected corrupt-primary save, and the two-file power-loss limitation in README.md.

Use the existing Node built-ins and public exports. Keep old project tests and behavior. Do not add dependencies. Run npm test after the last change.
