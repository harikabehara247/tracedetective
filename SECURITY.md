# Security Policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting ("Report a vulnerability" on the repository's Security tab) and include steps to reproduce. You should get an acknowledgement within 7 days.

## Design notes

- TraceDetective is a static site with no server component. There is no endpoint that fetches URLs on a user's behalf, so there is no server-side request forgery (SSRF) surface.
- Imported traces are parsed with `JSON.parse` and validated with Zod. Imported data is never executed and is always rendered as text through React (no `dangerouslySetInnerHTML`, no `eval`).
- Limits: 2 MB per file, 10,000 spans, 512-character names, 1,024-character attribute values, 64 attributes per span.
- Attribute values with sensitive-looking keys (password, secret, token, authorization, cookie, API key, session, credential) are redacted on import.
- The app sends no trace data over the network.
- Production builds include a Content Security Policy: scripts, styles, fonts and images from the site only (`'unsafe-inline'` styles are needed for computed bar positions), `connect-src 'self' https:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`. Hosts that support headers (Cloudflare Pages, Netlify) also get `frame-ancestors 'none'`, `nosniff` and `Referrer-Policy: no-referrer` from `public/_headers`.

## URL check

- Measurements are made by Google PageSpeed Insights (Google's servers) or by the visitor's own browser. Neither runs on infrastructure this project controls.
- Input is limited to http/https, 2,048 characters, no credentials, no secret-looking query parameters, and public hostnames. Loopback, private (RFC 1918), carrier-grade NAT, link-local (including `169.254.169.254`), multicast, reserved, IPv6 unique-local and link-local, IPv4-mapped IPv6, integer and hex IP forms, single-label names and `.local`, `.internal`, `.lan`, `.home.arpa` and `localhost` names are refused.
- Browser probe requests use `mode: no-cors`, `credentials: omit`, `referrerPolicy: no-referrer`, `cache: no-store`, a 10-second timeout and a fixed count of 5 sequential requests, so the page cannot be used to read responses or send a burst of traffic.
- If a server-side checker is ever added, it must also resolve DNS and re-check every redirect hop against the same block list, cap response size, redirects and time, and rate-limit by client.
