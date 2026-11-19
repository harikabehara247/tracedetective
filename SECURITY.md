# Security Policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting ("Report a vulnerability" on the repository's Security tab) and include steps to reproduce. You should get an acknowledgement within 7 days.

## Design notes

- TraceDetective is a static site. Its only server component is the optional analysis service in `worker/`, which forwards a validated address to Google PageSpeed Insights and never fetches the address itself, so there is no server-side request forgery (SSRF) surface.
- Imported traces are parsed with `JSON.parse` and validated with Zod. Imported data is never executed and is always rendered as text through React (no `dangerouslySetInnerHTML`, no `eval`).
- Limits: 2 MB per file, 10,000 spans, 512-character names, 1,024-character attribute values, 64 attributes per span.
- Attribute values with sensitive-looking keys (password, secret, token, authorization, cookie, API key, session, credential) are redacted on import.
- The app sends no trace data over the network.
- Production builds include a Content Security Policy: scripts, styles, fonts and images from the site only (`'unsafe-inline'` styles are needed for computed bar positions), `connect-src 'self' https:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`. Hosts that support headers (Cloudflare Pages, Netlify) also get `frame-ancestors 'none'`, `nosniff` and `Referrer-Policy: no-referrer` from `public/_headers`.

## Website analysis

- Measurements are made by Google PageSpeed Insights (Google's servers) or, optionally, by the visitor's own browser.
- Input is limited to http/https, 2,048 characters, no credentials, no secret-looking query parameters, and public hostnames. Loopback, private (RFC 1918), carrier-grade NAT, link-local (including `169.254.169.254`), multicast, reserved, IPv6 unique-local and link-local, IPv4-mapped IPv6, integer and hex IP forms, single-label names and `.local`, `.internal`, `.lan`, `.home.arpa` and `localhost` names are refused.
- Browser probe requests use `mode: no-cors`, `credentials: omit`, `referrerPolicy: no-referrer`, `cache: no-store`, a 10-second timeout and a fixed count of 5 sequential requests, so the page cannot be used to read responses or send a burst of traffic.

## Analysis service (worker/)

- The Google API key is stored only as a Cloudflare Worker secret (`PSI_API_KEY`), set from the `PSI_API_KEY` GitHub Actions secret by piping it to `wrangler secret put`. It is never in the repository, in a `VITE_` variable or in the browser bundle, and it is removed from any error text before a response is sent. The key should be restricted to the PageSpeed Insights API in Google Cloud.
- Requests are accepted only from the origins in `ALLOWED_ORIGINS`. Other origins get 403. (Origin checks stop other websites from using the service from their visitors' browsers; they do not stop scripts, which the rate limits cover.)
- The same URL validation as the app runs on the server. Only `GET /v1/pagespeed` and `GET /health` exist; query strings over 2,300 characters are refused.
- Rate limits: 6 analyses a minute per client IP and 15 a minute for the whole service, which keeps a single key under Google's default 25,000 queries a day. Results are cached for 15 minutes per address and device, and only successful results are cached.
- Calls to Google time out after 80 seconds. `/health` reports whether a key is configured without revealing it.
- The service writes no logs and Workers Logs is disabled in `wrangler.toml`.
