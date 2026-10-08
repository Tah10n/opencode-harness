# Existing connection and runner mismatch

The ordinary OpenCode local metadata contains a completed openai/gpt-5.6-luna
assistant frame at 2026-10-06 09:28 UTC; that session records version 1.18.26.
The current PATH binary is now 1.18.34; another installed binary is 1.18.16.
No ordinary OpenCode process was running when inspected, so its historical
process HOME/XDG environment cannot be asserted from a current process snapshot.

The accessible current host record is OAuth under the default OpenCode XDG data
location. The runner host user/HOME and unset XDG_DATA_HOME resolve that same
file and openai provider. The record was updated after v2, at 09:28 UTC, and its
access currently expires on 2026-10-16 at 09:28 UTC. Access, refresh and account
fields are present; their values are neither printed nor retained. The v2
expired-record diagnostic is historical and does not describe current login.
Source inspection and the ordinary run's timing support native refresh as the
explanation for this update; no extra inference or login was performed here.

The previous runner read the default file directly and rejected expired access,
without invoking OpenCode's native refresh. OpenCode 1.18.26's auth.loader rereads
the current record, refreshes expired access, persists the token response's real
expiry and single-flights concurrent refreshes. The host now reuses that exact
loader and its dependencies, with type erasure and host bindings only. Pinned
upstream source hashes are in vendor/native-auth-source.json and the original
license is retained. The helper only exposes auth readiness/current credentials
to the existing host scheduler; its local readiness request cannot reach a model.

The participant deliberately uses user node, HOME=/work/home and
XDG_DATA_HOME=/work/data, /opt/opencode 1.18.26 and provider openai/model
gpt-5.6-luna. It receives only a non-secret local relay key, with no auth.json or
host connection mounted. Real authorization stays on the host. This isolation
is intentional and unchanged; no credential copying is needed.

Pre-preparation readiness has passed on the current record with zero OAuth
refresh calls and zero inference calls. Synthetic regressions cover the XDG and
auth-content sources, current-record changes, expiry after initial readiness,
native concurrent refresh/rotation/persistence, failed refresh without changing
expiry, cancellation, missing/invalid required fields and preparation refusal
before resources. Real admission repeats readiness before any marker; refresh
failure during the authorized pass closes further admission.
