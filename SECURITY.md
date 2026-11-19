# Security Policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting ("Report a vulnerability" on the repository's Security tab) and include steps to reproduce. You should get an acknowledgement within 7 days.

## Design notes

- TraceDetective is a static site with no server component in this release.
- Imported traces are parsed with `JSON.parse` and validated with Zod. Imported data is never executed and is always rendered as text.
- Limits: 2 MB per file, 10,000 spans, 512-character names, 1,024-character attribute values, 64 attributes per span.
- Attribute values with sensitive-looking keys (password, secret, token, authorization, cookie, API key, session, credential) are redacted on import.
- The app sends no trace data over the network.

## Planned URL checker

A URL check would need a server. It will not ship until it has: http/https only; DNS resolution with private, loopback, link-local and reserved addresses blocked, re-checked at every redirect; bounded timeouts, response size and redirect count; and rate limiting. Until then the feature is shown as unavailable.
