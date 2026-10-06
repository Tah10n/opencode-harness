// MIT: reused OpenCode 1.18.26 auth.loader and its dependencies; see OPENCODE-LICENSE.
// Native logic is unchanged; only TypeScript types and host bindings differ.
// https://github.com/anomalyco/opencode/blob/v1.18.26/packages/opencode/src/plugin/openai/codex.ts
// Upstream codex.ts SHA-256: a1e214a02cb93cb4833a35b5049bbee4707a0eece265df9902755546adf636b2
// Upstream ws-pool.ts SHA-256: d73d98545c8c5281673b1f700b78f5c9dc25d53c9117982a54b626a2e9455130
export async function nativeAuthLoader({getAuth,setAuth,fetch}) {
const CLIENT_ID="app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER='https://auth.openai.com';
const issuer=ISSUER,codexApiEndpoint='https://chatgpt.com/backend-api/codex/responses';
const options={experimentalWebSockets:false};
const input={client:{auth:{set:({path,body})=>{if(path.id!=='openai')throw Error('Native auth provider changed');return setAuth(body);}}}};
const OAUTH_DUMMY_KEY='opencode-oauth-dummy-key';
const TITLE_HEADER="x-opencode-title";
const websocketFetches=[];let websocketFetchInstalled=false;
function parseJwtClaims(token        )                            {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString())
  } catch {
    return undefined
  }
}

function extractAccountIdFromClaims(claims               )                     {
  return (
    claims.chatgpt_account_id ||
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  )
}

function extractAccountId(tokens               )                     {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token)
    const accountId = claims && extractAccountIdFromClaims(claims)
    if (accountId) return accountId
  }
  if (tokens.access_token) {
    const claims = parseJwtClaims(tokens.access_token)
    return claims ? extractAccountIdFromClaims(claims) : undefined
  }
  return undefined
}


function extractResidency(token        )                     {
  const claims = parseJwtClaims(token)
  const residency =
    claims?.["https://api.openai.com/auth"]?.chatgpt_compute_residency ?? claims?.chatgpt_compute_residency
  if (!residency || residency === "no_constraint") return undefined
  return residency
}


async function refreshAccessToken(refreshToken        , issuer = ISSUER)                         {
  const response = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  })
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`)
  }
  return response.json()
}


function withoutInternalHeaders                                     (init               )                {
  if (!init?.headers) return init
  if (init.headers instanceof Headers) {
    const headers = new Headers(init.headers)
    headers.delete(TITLE_HEADER)
    return { ...init, headers }
  }

  if (Array.isArray(init.headers)) {
    return { ...init, headers: init.headers.filter((item) => item[0].toLowerCase() !== TITLE_HEADER) }
  }

  return {
    ...init,
    headers: Object.fromEntries(Object.entries(init.headers).filter(([key]) => key.toLowerCase() !== TITLE_HEADER)),
  }
}

const OpenAIWebSocketPool={withoutInternalHeaders,createWebSocketFetch(){throw Error('Experimental WebSockets disabled');}};
const hooks={      async loader(getAuth) {
        const auth = await getAuth()
        const websocketFetch = options.experimentalWebSockets
          ? OpenAIWebSocketPool.createWebSocketFetch({ httpFetch: fetch })
          : undefined
        if (websocketFetch) {
          websocketFetches.push(websocketFetch)
          websocketFetchInstalled = true
        }
        if (auth.type !== "oauth") return websocketFetch ? { fetch: websocketFetch } : {}

        let refreshPromise 
                     
                            
                                           
              
                     

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(requestInput                   , init              ) {
            if (init?.headers) {
              if (init.headers instanceof Headers) {
                init.headers.delete("authorization")
                init.headers.delete("Authorization")
              } else if (Array.isArray(init.headers)) {
                init.headers = init.headers.filter(([key]) => key.toLowerCase() !== "authorization")
              } else {
                delete init.headers["authorization"]
                delete init.headers["Authorization"]
              }
            }

            const currentAuth = await getAuth()
            if (currentAuth.type !== "oauth")
              return websocketFetch ? websocketFetch(requestInput, init) : fetch(requestInput, init)

            const authWithAccount = currentAuth                                               

            if (!currentAuth.access || currentAuth.expires < Date.now()) {
              if (!refreshPromise) {
                refreshPromise = refreshAccessToken(currentAuth.refresh, issuer)
                  .then(async (tokens) => {
                    const accountId = extractAccountId(tokens) || authWithAccount.accountId
                    await input.client.auth.set({
                      path: { id: "openai" },
                      body: {
                        type: "oauth",
                        refresh: tokens.refresh_token,
                        access: tokens.access_token,
                        expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                        ...(accountId && { accountId }),
                      },
                    })
                    return {
                      access: tokens.access_token,
                      accountId,
                    }
                  })
                  .finally(() => {
                    refreshPromise = undefined
                  })
              }

              const refreshed = await refreshPromise
              currentAuth.access = refreshed.access
              authWithAccount.accountId = refreshed.accountId
            }

            const headers = new Headers()
            if (init?.headers) {
              if (init.headers instanceof Headers) {
                init.headers.forEach((value, key) => headers.set(key, value))
              } else if (Array.isArray(init.headers)) {
                for (const [key, value] of init.headers) {
                  if (value !== undefined) headers.set(key, String(value))
                }
              } else {
                for (const [key, value] of Object.entries(init.headers)) {
                  if (value !== undefined) headers.set(key, String(value))
                }
              }
            }
            headers.set("authorization", `Bearer ${currentAuth.access}`)
            if (authWithAccount.accountId) {
              headers.set("ChatGPT-Account-Id", authWithAccount.accountId)
            }

            const parsed =
              requestInput instanceof URL
                ? requestInput
                : new URL(typeof requestInput === "string" ? requestInput : requestInput.url)
            const rewrite = parsed.pathname.includes("/v1/responses") || parsed.pathname.includes("/chat/completions")
            const url = rewrite ? new URL(codexApiEndpoint) : parsed
            if (rewrite) {
              const residency = extractResidency(currentAuth.access)
              if (residency) headers.set("x-openai-internal-codex-residency", residency)
            }

            const requestInit = {
              ...init,
              body: init?.body,
              headers,
            }
            if (websocketFetch && parsed.pathname.endsWith("/responses")) return websocketFetch(url, requestInit)
            return fetch(url, OpenAIWebSocketPool.withoutInternalHeaders(requestInit))
          },
        }
      },
};
return hooks.loader(getAuth);
}
