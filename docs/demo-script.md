# 60-second demo script

All data in this demo is synthetic. Say so on screen.

| Time | Screen | Narration |
| --- | --- | --- |
| 0–8 s | Landing page | "TraceDetective helps you find where a slow API request spends its time. It is free, open source, and runs in your browser." |
| 8–20 s | Try the demo → slow database trace | "This is a synthetic order request that takes 3.2 seconds. The cyan line is the critical path: what the request was actually waiting on." |
| 20–32 s | Insight card, click the SELECT evidence | "One database call holds most of the critical path. The insight shows its evidence, other explanations, and what to check next, like the query plan. It does not claim to know the root cause." |
| 32–44 s | Compare with healthy | "Compared with a healthy trace of the same endpoint, only this query regressed. Everything else stayed the same." |
| 44–52 s | Failing dependency trace, Errors only filter | "For failures, it points to where the error started and which parents only propagated it." |
| 52–60 s | Reports → Print | "Export JSON with provenance or print a report. Nothing was uploaded at any point." |
