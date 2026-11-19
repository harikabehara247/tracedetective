# Changelog

All notable changes are listed here. The format follows Keep a Changelog, and versions follow Semantic Versioning.

## [Unreleased]

## [0.1.0] - unreleased

### Added
- TraceDetective JSON schema 1.0 with Zod validation, structural checks (duplicates, missing parents, cycles, trace ID mismatch) and clear error messages.
- Span forest, exclusive time using the union of child intervals, and an iterative critical-path algorithm.
- Diagnostic rules: slow database call, slow external call, erroring dependency, repeated sequential calls, unexplained time.
- Two-trace comparison with matched spans, deltas, added and removed spans and new errors.
- Four synthetic sample traces.
- Pages: landing, analyze (demo, upload, URL check placeholder, SDK guide), examples, trace workspace, compare, reports, docs, about and 404.
- JSON export with provenance and a print-friendly report.
- Vitest unit and component tests and Playwright smoke tests.
