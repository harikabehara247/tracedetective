# TraceDetective analysis service (PageSpeed proxy)

A small Cloudflare Worker that lets visitors run Google PageSpeed Insights without an API key of their own. It adds the project's key on the server, so the key never reaches the browser or this repository.

Without this service the site still works: it calls Google's public keyless endpoint directly, which has a small shared quota and often answers "quota exceeded" at busy times.

## What it does

`GET /v1/pagespeed?url=<public URL>&strategy=mobile|desktop`

1. Accepts requests only from the origins in `ALLOWED_ORIGINS` (the GitHub Pages site).
2. Validates the URL with the same rules as the app (`src/core/url.ts`): public `http`/`https` hosts only, no credentials, no secret-looking query parameters, no local or private addresses, at most 2,048 characters.
3. Limits each client IP to 6 analyses a minute and the whole service to 15 a minute. 15 a minute is at most 21,600 a day, below Google's default of 25,000 queries a day for one key.
4. Returns a cached result for the same URL and device for 15 minutes (`CACHE_TTL_SECONDS`), so repeated tests do not use quota.
5. Calls Google with the key, gives up after 80 seconds, and returns a compact summary. The key is removed from any message before it is returned.

`GET /health` returns `{"ok":true,"keyConfigured":true|false,"originsConfigured":true|false}`. It never returns the key.

Errors use a JSON body `{"error":{"code","message"}}`:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_url` | Not a public web address, or a bad `strategy` |
| 403 | `forbidden_origin` | Request did not come from the TraceDetective site |
| 422 | `lighthouse` | Google could not load the page (DNS error, page timeout, blocked) |
| 429 | `rate_limited` | Too many analyses from this client; `Retry-After: 60` |
| 503 | `busy` | Service-wide per-minute limit reached |
| 503 | `quota` | The key's daily quota is used up; `Retry-After: 3600` |
| 503 | `not_configured` | No key set, or Google rejected the key |
| 504 | `timeout` | Google took longer than 80 seconds |
| 502 | `upstream` | Any other failure from Google |

The service never fetches the visitor's URL itself, so it cannot be used to reach internal networks. It writes no request logs, and Workers Logs is turned off in `wrangler.toml`. The client IP is used only as the rate-limit key.

## One-time setup

### 1. Google API key

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project (or use an existing one).
2. Enable **PageSpeed Insights API** (APIs & Services → Library).
3. Create an API key (APIs & Services → Credentials → Create credentials → API key).
4. Edit the key and set **API restrictions → Restrict key → PageSpeed Insights API**. Leave application restrictions at "None": the key is used from the Worker, not from a browser, so HTTP-referrer restrictions would block it.
5. Optionally lower the daily quota under APIs & Services → PageSpeed Insights API → Quotas.

PageSpeed Insights API usage is free. Do not commit the key, paste it into an issue, or put it in a `VITE_` variable: anything with that prefix is built into the public JavaScript.

### 2. Cloudflare

1. Create a free Cloudflare account and note the **Account ID** (Workers & Pages overview).
2. Create an API token (My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**), limited to that account.
3. Open Workers & Pages once so the account has a `workers.dev` subdomain.

### 3. GitHub repository settings

Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | the account ID |
| Secret | `PSI_API_KEY` | the Google key from step 1 |
| Variable | `PSI_PROXY_URL` | the Worker URL, for example `https://tracedetective-psi.<subdomain>.workers.dev` |

### 4. Deploy

1. Actions → **Deploy analysis service** → Run workflow. It runs the proxy tests, deploys the Worker, stores the key as a Worker secret, and checks `/health`. If `PSI_PROXY_URL` is not set yet, take the URL from the deploy log, add the variable, and run it again so the health check runs.
2. Actions → **Deploy to GitHub Pages** → Run workflow. The site is rebuilt with `VITE_PSI_PROXY_URL` and starts using the service.
3. **Live site checks** runs after the Pages deploy. It checks `/health` and runs one real analysis of `example.com`.

Later changes to `worker/` or `src/core/url.ts` on `main` redeploy the service automatically.

## Rotating or removing the key

- Rotate: create a new key in Google Cloud, update the `PSI_API_KEY` secret, run **Deploy analysis service**, then delete the old key.
- Turn the service off: delete the `PSI_PROXY_URL` variable and redeploy Pages. The site goes back to Google's keyless endpoint.

## Local development

```bash
cd worker
printf 'PSI_API_KEY=your-test-key\n' > .dev.vars   # .dev.vars is git-ignored
npx wrangler@4.165.0 dev --var ALLOWED_ORIGINS:http://localhost:5173
```

Then run the app with `VITE_PSI_PROXY_URL=http://localhost:8787 npm run dev`. The production build's Content Security Policy only allows `https:` connections, so use `npm run dev` (not `preview`) for a local `http` proxy.

Tests: `npx vitest run tests/worker.test.ts tests/pagespeed.test.ts`.
