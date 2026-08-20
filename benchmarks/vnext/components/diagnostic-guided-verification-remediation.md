# Diagnostic-guided verification remediation

Development-only component. It keeps the single diff-guided retry and the
fixed runner-selected public check from P12. After that public check fails, the
host also supplies its bounded, privacy-sanitized stdout/stderr diagnostic to
the retry. The check runs in the credential-free trusted-check environment;
private absolute paths, sensitive-looking lines, terminal controls, and output
beyond 8,000 UTF-8 bytes are removed or redacted before model exposure.

The diagnostic comes only from the public check executed before hidden files
are staged. Hidden output, hidden files, reference solutions, credentials, and
private paths remain unavailable. The host independently repeats the bound
check after a retry mutation and remains the only terminal evidence authority.
There is no second retry.
