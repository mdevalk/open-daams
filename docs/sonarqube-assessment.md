# SonarQube assessment: open-daams

_Snapshot date: 2026-08-21._

This is a static-analysis assessment of the open-daams codebase against **SonarQube Community
Edition**'s default TypeScript/JavaScript rule set — bugs, vulnerabilities, security hotspots,
maintainability code smells, duplication, and test-coverage integration. It complements the other
`docs/*-assessment.md` documents (OWASP/NIS2/BIO2 cover security posture from a different angle;
this one is closer to code-quality/maintainability), same "assessment, not certification" framing.

> **Method.** Run locally against a throwaway **SonarQube Community Edition** Docker container
> (`sonarqube:community`, embedded H2 database — fine for a one-off local run, not for anything
> meant to persist), scanned via the `sonarsource/sonar-scanner-cli` Docker image against
> `sonar-project.properties` (committed at the repo root) with real coverage data from
> `npx vitest run --coverage` (the `lcov` reporter added to `vitest.config.mts` for this purpose).
> **Not wired into CI** — this is a manual, occasional check, not a build gate. One methodological
> note worth flagging for anyone repeating this: SonarQube's issue-tracker can display **stale**
> per-function complexity numbers when re-analyzing the *same* project after a fix (it appears to
> carry forward the previous issue's message text under some conditions) — always delete and
> recreate the project (or use a fresh container) before trusting a "did this fix actually work"
> comparison; a same-project rescan is fine for headline/aggregate metrics.

## Summary

| Metric | Result |
|---|---|
| Bugs | **0** (Reliability rating A) |
| Vulnerabilities | **0** (Security rating A) |
| Security hotspots | **0** (Security Review rating A) |
| Maintainability rating | **A** |
| Code smells | 255 |
| — of which CRITICAL severity | 14 |
| Cognitive-complexity issues (rule S3776) | 14 |
| Duplicated lines | 3.0% |
| Test coverage (line, via lcov) | ~44-46%* |
| Lines of code analyzed | ~15,300 |
| Maintainability debt (`sqale_index`) | ~1,240 minutes (~20.7 hours) |

\* Coverage fluctuates a few points run-to-run depending on which files were touched most recently
in the same session; treat it as "low-to-mid 40s%," not a fixed number. It was 33.2% at the start
of this session's testing/refactoring work.

**Headline takeaway**: zero bugs, vulnerabilities, or security hotspots, and all three reliability/
security ratings are A. Everything flagged is a maintainability (code smell) concern — this is a
"clean up when convenient" list, not a security or correctness gate.

## Where the 255 code smells concentrate

Five rules account for roughly three-quarters of all findings:

| Rule | Count | What it flags |
|---|---|---|
| `typescript:S9011` | 70 | `<button>` elements missing an explicit `type` attribute (defaults to `submit` inside a `<form>` — a real, if usually low-impact, footgun) |
| `typescript:S6759` | 57 | React component props not typed `Readonly<...>` |
| `typescript:S3358` | 27 | Nested ternary operators (readability) |
| `typescript:S9020` | 20 | Testing Library `find*` vs `get*`/`query*` misuse (all in this session's own new test files) |
| `typescript:S3776` | 14 | Cognitive complexity over the default threshold of 15 |

The remainder (`S6582` optional-chaining preference, `S7776` array-as-Set for existence checks,
`S7773`, `S4624`, `S6551`, and a long tail of 1-3-count rules) are minor, scattered findings not
worth a dedicated pass.

## Cognitive complexity (S3776) — the one category worth actively chasing

This is the only rule category where the metric tracks real bug risk rather than a style
preference: the deeper and more tangled a function's branching, the more likely a future edit
misses an edge case. It started this session at **20 issues** (worst: `generate-permit-pdf.ts` at
**107** — the single biggest outlier by a wide margin) and is down to **14** after two fix passes:

1. **`generate-permit-pdf.ts`** (107 → 0) — decomposed into ~28 functions mapped 1:1 to the
   TEHDAS2 D6.3 Annex 9 template sections the file already followed in its comments. Verified
   behavior-identical via a snapshot test of the exact ordered sequence of PDF drawing calls
   (`src/lib/generate-permit-pdf.test.ts`) — raw PDF bytes aren't deterministic run-to-run, so this
   checks the level that actually matters. Also raised this file's own test coverage 0% → 96%.
2. **5 RBAC-gated API route handlers** (`applications/route.ts` 42, `spe-operators/[id]/route.ts`
   40, `data-holders/[id]/route.ts` 40, `permits/[id]/change-requests/[requestId]/route.ts` 39,
   `permits/route.ts` 35) — all → 0. Dominant complexity shape was different from the PDF file:
   mostly wide repeated conditional-field construction (`body.X !== undefined ? {...} : {}`
   repeated 10-19× in one object literal) plus, in two files, a Prisma `$transaction`/retry-loop
   sequence. Fixed by extracting pure `build<X>UpdateData()`/`describe<X>Changes()` helper pairs
   and one named function per already-commented orchestration step. Added guard-clause-level route
   tests (`vi.mock('@/lib/db')`) plus direct unit tests for every pure extracted function.

### Still open (14 issues, 11 files)

| File | Complexity | Category |
|---|---|---|
| `src/components/StudyCohortExplorer.tsx` | 31, 18 | Component (has existing tests) |
| `src/app/[locale]/applications/[id]/page.tsx` | 29 | RSC page (no existing tests) |
| `src/lib/hdeu.ts` | 26 | Lib (partial existing tests) |
| `src/app/[locale]/financials/page.tsx` | 21 | RSC page (no existing tests) |
| `src/lib/ncp-client.ts` | 21, 17 | Lib, both pure functions (existing tests) |
| `src/components/NewApplicationForm.tsx` | 22 | Component (has existing tests) |
| `src/app/api/data-users/[id]/route.ts` | 20 | API route — same proven pattern as the 5 already fixed |
| `src/app/api/spe-providers/[id]/route.ts` | 20 | API route — same proven pattern |
| `src/app/[locale]/permits/[id]/page.tsx` | 20 | RSC page (no existing tests) |
| `src/components/DeadlineExtensionPanel.tsx` | 20 | Component (has existing tests) |
| `src/app/api/spe-types/[id]/route.ts` | 18 | API route — same proven pattern |
| `src/components/PermitChangeRequestPanel.tsx` | 17 | Component (has existing tests) |

The 3 remaining API routes are confirmed (read all three) to be the exact same shape as the 5
already fixed — lowest-risk, highest-confidence next step. The 3 RSC pages are the one genuinely
open question: async Server Components with inline Prisma calls and zero existing tests, a
different testing shape than anything proven safe so far this session.

## Duplication (3.0% overall — two concrete, worth-fixing clusters)

Not evenly spread; two specific pairs/groups account for most of it:

- `src/app/api/invoices/[invoiceId]/route.ts` and
  `src/app/api/permits/[id]/invoices/[invoiceId]/route.ts` — 70-71% duplicated. Diffed directly:
  near-identical `PATCH` handlers, the only real difference is the permit-scoped one adds an
  `invoice.permitId !== id` ownership check. A shared `updateInvoiceStatus()` helper would resolve
  this in well under an hour.
- `AuditLogTable.tsx` / `SecurityLogTable.tsx` / `IntegrationLogTable.tsx` — 49-54% duplicated.
  Same table/`thead`/`tbody` wrapper markup in all three, differing only in columns and per-row
  cell content — a good candidate for a shared generic `<LogTable columns={...} rows={...}>`
  component now that three concrete usages exist.

The remaining duplication is scattered and not worth chasing to zero on a reference-implementation
project.

## What's not worth chasing

This is a community-built, unofficial EHDS/TEHDAS2 reference implementation (see the project
README's own disclaimer), not a production app under a maintainability SLA. Driving the 255 code
smells to zero — especially the 70 button-`type` and 57 readonly-prop findings, both real but
low-severity and mostly mechanical — is churn for its own sake past a certain point. The
recommendation from this assessment is narrower: finish the cognitive-complexity list (real bug-risk
signal), fix the two concrete duplication clusters above, and treat the rest as opportunistic
("touch a file, fix it while you're there") rather than a dedicated pass.
