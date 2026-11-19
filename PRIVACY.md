# Privacy

## Traces
- TraceDetective processes traces entirely in your browser. Trace data is never sent to a server.
- Imported traces are stored in your browser tab's `sessionStorage` so a page reload does not lose them. Closing the tab clears them. You can remove an import sooner from the Upload page.
- Attribute values with sensitive-looking keys are replaced with `[redacted]` on import. This is a safety net, not a guarantee: remove secrets and personal data before importing.
- Exported reports are created on your device and saved through your browser's download dialog.

## URL check
The URL check is the only feature that contacts anything other than this site, and only when you press **Run check**:
- **Google PageSpeed Insights** (if selected): the URL you enter, the test device and, if you provide one, your API key are sent to `www.googleapis.com`. Google's privacy policy applies to that request. The key is held in memory for the page and never stored.
- **Browser probe** (if selected): your browser sends 5 requests to the URL you enter, with no cookies, no referrer and caching disabled. The site you test sees your IP address, as with any visit.
- URLs with credentials or secret-looking query parameters (token, key, signature, password, session and similar) are refused before anything is sent.

## Stored on your device
- `sessionStorage` key `tracedetective:imports`: traces you imported in this tab.
- `localStorage` key `td:tour-done`: set once you finish or skip the walkthrough.

## Not collected
No accounts, no ads, no cookies and no analytics. If privacy-respecting usage analytics are ever added, they will be documented here first and will never include trace content or URLs you check.
