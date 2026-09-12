# Make HTTP failures consistent for the user consumer
Keep request(fetcher,url,options={}) in src/http.mjs and findUser(fetcher,base,id,options={}) in src/users.mjs. fetcher is injected, not global networking. Its response supplies numeric status and async json().
request calls fetcher exactly once with the URL and options; preserve option values including the identical AbortSignal. For 200..299 return parsed JSON, except 204 returns null without calling json. A successful response's JSON failure propagates unchanged. Fetch rejection propagates unchanged.
Export HttpError extending Error with name 'HttpError' and status, url, body fields. Every non-2xx status throws HttpError; body is parsed JSON when parsing succeeds, otherwise null (a body parse error must not hide HTTP status). Error message wording is unspecified.
findUser constructs base+'/users/'+encodeURIComponent(id), delegates with options, and returns null only for an actual HttpError with status 404; all other failures propagate by identity. Base has no trailing slash; IDs are strings. Do not retry requests.
Add project tests covering 204 without parsing, malformed error body retaining status, and findUser 404 versus another failure with encoded ID/options. Document HttpError, 204, and the consumer's 404 policy in README.md.

Use the existing Node built-ins and public exports. Keep old project tests and behavior. Do not add dependencies. Run npm test after the last change.
