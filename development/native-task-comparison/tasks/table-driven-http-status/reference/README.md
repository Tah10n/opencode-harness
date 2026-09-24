# table-driven-http-status

classifyStatus owns one fixed known-status table; retry/label/auth helpers delegate. Integer100..599 category is informational/success/redirect/client_error/server_error by hundred. Unlisted codes keep category but Unknown status and false flags. Invalid values are unknown without coercion. Retry codes408,425,429,500,502,503,504 only; auth refresh401 only. Known labels are the published project table, not a live standards registry. Fresh outputs cannot mutate policy; no generic5xx retry or403 refresh. Run npm test.
