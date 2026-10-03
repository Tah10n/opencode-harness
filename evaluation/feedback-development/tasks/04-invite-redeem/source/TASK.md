# Consume a persisted invite only on valid redemption

Fix `Invites.redeem(token,user,team)`. Reject missing/used tokens, nonstring or blank users, and the wrong team without changing the file. A valid redemption adds the user to the intended team exactly once, consumes that token and persists both changes. The same token must never admit another user, including after reopening Invites. Joining with another token must not duplicate an existing member.

Preserve create's duplicate rejection, revoke's true/false/idempotent semantics, membership of other teams, other tokens and the JSON shape. A revoked token cannot be redeemed or remove existing members. Keep the public create/redeem/revoke/read API.

Run `npm test` and `git diff --check` after the final change. Ordinary tests are public and may be extended. Keep their existing contract coverage. Use Node.js 24 and the standard library; no dependency installation is needed.
