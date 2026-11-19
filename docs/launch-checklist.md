# 7-day launch checklist

Each item needs evidence (a link, a command output or a screenshot) before it is ticked.

## Day 1: scope, brand, repository
- [ ] Repository `tracedetective` created and owner, author email and default branch confirmed
- [ ] Logo in `public/logo.svg`, colours match the PRD
- [ ] `npm run build` passes

## Day 2: parser and samples
- [ ] Schema validation and malformed-input tests pass
- [ ] Four synthetic samples load and are labelled synthetic

## Day 3: workspace
- [ ] Waterfall, tree, details and insights stay in sync, including by keyboard
- [ ] Critical-path and self-time tests pass

## Day 4: compare, export, responsive
- [ ] Comparison handles missing spans and zero baselines
- [ ] JSON export includes provenance; print to PDF works
- [ ] E2E tests pass at 375, 768 and 1440 px with no console errors

## Day 5: docs and review
- [ ] README, PRIVACY, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG reviewed
- [ ] Accessibility pass: focus order, contrast, screen reader labels, reduced motion
- [x] Website analysis without visitor API keys (PageSpeed Insights through the analysis service, optional browser probe), with input validation, private-address refusal and tests

## Day 6: deploy and case study
- [ ] Static deployment live; URL opened and checked by a person
- [ ] `VITE_REPO_URL` set so GitHub links show
- [ ] One reproducible case study written with the template, measured numbers only
- [ ] Demo recorded from `docs/demo-script.md`

## Day 7: launch
- [ ] Tagged release `v0.1.0` with changelog
- [ ] Launch posts describe engineering value only, with no unverified claims
- [ ] Feedback and issues triaged
