# Privacy

## Traces
- TraceDetective processes traces entirely in your browser. Trace data is never sent to a server.
- Imported traces are stored in your browser tab's `sessionStorage` so a page reload does not lose them. Closing the tab clears them. You can remove an import sooner from the Investigate a trace page.
- Attribute values with sensitive-looking keys are replaced with `[redacted]` on import. This is a safety net, not a guarantee: remove secrets and personal data before importing.
- Exported reports are created on your device and saved through your browser's download dialog.
- The downloadable sample trace (`samples/tracedetective-sample-slow-database.otlp.json`) is a static, synthetic file served by this site. Downloading it sends nothing.

## Analyze a website
Analyze a website is the only feature that contacts anything other than this site, and only when you press **Analyze Website**. You never enter an API key.
- **Google PageSpeed Insights**: the address you enter and the test device are sent to Google. Google's privacy policy applies.
  - On the main site this goes through the **TraceDetective analysis service** (a Cloudflare Worker, source in `worker/`). It adds the project's own API key on the server, uses your IP address only to count tests per minute, keeps the result for the same address and device for 15 minutes so repeat tests are fast, and writes no request logs. Cloudflare's own privacy policy applies to the connection.
  - Copies of the site built without the service call Google's public endpoint (`www.googleapis.com`) directly from your browser.
- **Browser probe** (optional, under Advanced options): your browser sends 5 requests to the address you enter, with no cookies, no referrer and caching disabled. The site you test sees your IP address, as with any visit.
- A report's share link contains only the address, the device and your options. Reports are not stored on any server or on your device.
- Addresses with credentials or secret-looking query parameters (token, key, signature, password, session and similar) are refused before anything is sent.

## Stored on your device
- `sessionStorage` key `tracedetective:imports`: traces you imported in this tab.
- `localStorage` key `td:tour-done`: set once you finish or skip the walkthrough.

## Not collected
No accounts, no ads, no cookies and no analytics. If privacy-respecting usage analytics are ever added, they will be documented here first and will never include trace content or URLs you check.
