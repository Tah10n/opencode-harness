# Mutation path guard

The host installs one pre-execution mutation guard. It rejects native file
mutation calls when their declared target is a secret-like path such as an
environment file, credential file, secret file, or private-key container.
Because arbitrary shell text cannot be classified completely as read-only, it
also rejects every shell call that names a secret-like path. The same
case-insensitive path classifier is used by runtime enforcement and trace
instrumentation.

The guard runs before the tool implementation. A rejected call is evidence of
an activated denial, not a completed secret write. The guard does not inspect
file contents, add writable paths, expose hidden data, run another model, or
change the task's public checks.
