# Case study: <title> (state "synthetic benchmark" or "real system")

> Label simulated data clearly. Report only numbers you measured, with the code and data to reproduce them.

## Problem
What request is slow or failing, for whom, and how was it noticed?

## Hypothesis
A testable statement, for example: "The inventory lookup dominates checkout latency under 20 concurrent requests."

## Environment and architecture
Hardware, OS, runtime and library versions, database and version, network setup, sampling rate.

## Source code and fixtures
Links to the exact commit, the demo service, load scripts and captured traces.

## Procedure
Warm-up requests, measured requests, concurrency, duration, and how traces were captured and exported.

## Baseline
p50, p95 and p99 latency and error rate before any change, with the number of requests measured.

## Intervention
What was changed and why.

## Results
| Metric | Baseline | After | Requests measured |
| --- | --- | --- | --- |
| p50 | | | |
| p95 | | | |
| p99 | | | |
| Error rate | | | |

## Trace screenshots
Before and after, with the relevant spans highlighted.

## What TraceDetective inferred
The findings it produced, which were correct, which were false positives, and what it missed.

## Threats to validity
Synthetic load, single machine, cache effects, clock skew, sampling, small sample sizes.

## What the tool can and cannot infer
Where time was spent, yes. Why, only with other evidence (query plans, logs, profiles).

## Reproducible artifacts
Links.

## Conclusion
