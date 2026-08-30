# SonarQube assessment: open-daams

_Snapshot date: 2026-08-21 (updated same day: 3 more API routes and 2 lib files' cognitive
complexity fixed — 14 → 8 CRITICAL issues remaining). Re-run 2026-08-30 after the Keycloak/OIDC
authentication integration (~1,000 net new lines across ~100 files) — 8 → 9 CRITICAL. Re-run again
2026-08-30 (same day, second pass) after a dedicated cognitive-complexity pass covering 7 of the
9 open findings (8 issues; `applications/[id]/page.tsx` explicitly deferred, see below) — 9 → 1
CRITICAL._

This is a static-analysis assessment of the open-daams codebase against **SonarQube Community
Edition**'s default TypeScript/JavaScript rule set — bugs, vulnerabilities, security hotspots,
maintainability code smells, duplication, and test-coverage integration. It complements the other
`docs/*-assessment.md` documents (OWASP/NIS2/BIO2 cover security posture from a different angle;
this one is closer to code-quality/maintainability), same "assessment, not certification" framing.

> **Method.** Run locally against a throwaway **SonarQube Community Edition** Docker container
> (`sonarqube:community`, embedded H2 database — fine for a one-off local run, not for anything
> meant to persist), scanned via `npx sonarqube-scanner` against `sonar-project.properties`
> (committed at the repo root) with real coverage data from `npx vitest run --coverage` (the
> `lcov` reporter already configured in `vitest.config.mts`). **Not wired into CI** — this is a
> manual, occasional check, not a build gate. One methodological note worth flagging for anyone
> repeating this: SonarQube's issue-tracker can display **stale** per-function complexity numbers
> when re-analyzing the *same* project after a fix (it appears to carry forward the previous
> issue's message text under some conditions) — always delete and recreate the project (or use a
> fresh container, as this re-run did) before trusting a "did this fix actually work" comparison;
> a same-project rescan is fine for headline/aggregate metrics.

## Summary

| Metric | Result (2026-08-21) | Result (2026-08-30, Keycloak) | Result (2026-08-30, S3776 pass) |
|---|---|---|---|
| Bugs | **0** (Reliability A) | **0** (Reliability A) | **0** (Reliability A) |
| Vulnerabilities | **0** (Security A) | **0** (Security A) | **0** (Security A) |
| Security hotspots | **0** (Security Review A) | **0** (Security Review A) | **0** (Security Review A) |
| Maintainability rating | **A** | **A** | **A** |
| Code smells | 252 | 268 | 255 |
| — of which CRITICAL severity | 8 | 9 | **1** |
| Cognitive-complexity issues (rule S3776) | 8 | 9 | **1** |
| Duplicated lines | 2.8% | 4.6% | 4.5% |
| Test coverage (line, via lcov) | ~45-48%* | 46.0% | 47.7% |
| Lines of code analyzed | ~15,400 | 16,369 | 16,659 |
| Maintainability debt (`sqale_index`) | ~1,193 min (~19.9h) | 1,257 min (~21.0h) | 1,143 min (~19.1h) |

\* Coverage fluctuates a few points run-to-run depending on which files were touched most recently
in the same session; treat it as "mid-to-high 40s%," not a fixed number.

**Headline takeaway**: zero bugs, vulnerabilities, or security hotspots, and all three
reliability/security ratings stay A across every re-run so far, Keycloak integration included. The
2026-08-30 cognitive-complexity pass covered all 9 open findings from the Keycloak re-run except
one — `applications/[id]/page.tsx` (29), explicitly deferred, see below — i.e. 8 findings across
7 files (`StudyCohortExplorer.tsx` alone carried 2 of the 9). It took CRITICAL findings from 9 down
to **1**, added real new test
coverage (+1.7pp) rather than just moving code around, and — as a side effect of extracting
branching logic into named helpers — also *reduced* two other smells that weren't directly
targeted: nested ternaries (S3358) 29 → 18, and `sqale_index` debt actually dropped below even the
pre-Keycloak 08-21 baseline. Code smells (255) and duplication (4.5%) are both back down close to
their 08-21 levels too, since this pass didn't add new duplicated code, only removed complexity.

## Where the 255 code smells concentrate

Five rules still account for the bulk of all findings. `S3776` is the one that moved sharply this
pass (9 → 1); the others are essentially flat, since this pass's technique (extracting logic into
named helper functions) doesn't touch button `type` attributes, readonly-prop typing, or test-file
assertion style:

| Rule | Count (08-21) | Count (08-30, Keycloak) | Count (08-30, S3776 pass) | What it flags |
|---|---|---|---|---|
| `typescript:S9011` | 70 | 77 | 77 | `<button>` elements missing an explicit `type` attribute (defaults to `submit` inside a `<form>` — a real, if usually low-impact, footgun). Untouched by this pass — no button markup was added or changed |
| `typescript:S6759` | 57 | 60 | 65 | React component props not typed `Readonly<...>` — pre-existing convention across the codebase; the +5 is the new sub-components this pass extracted (`PriorPermitDetails`, `BaseTabPanel`, `CohortTabPanel`, `ControlTabPanel`, `RelativeTabPanel` in `StudyCohortExplorer.tsx`), which follow the same existing (non-`Readonly`) convention as everything around them rather than introducing a new one |
| `typescript:S9020` | 20 | 23 | 23 | Testing Library `find*` vs `get*`/`query*` misuse (test files) — unchanged, this pass added tests but not that pattern |
| `typescript:S3358` | 27 | 29 | **18** | Nested ternary operators (readability) — dropped, a direct side effect of this pass: most of the extracted helpers (`yesNoLabel`, `populationLabel`, `deadlineExtensionViewState`, etc.) replaced a nested ternary with a guard-clause function body |
| `typescript:S6582` | 8 | 8 | 8 | Optional-chaining preference — unchanged |
| `typescript:S3776` | 8 | 9 | **1** | Cognitive complexity over the default threshold of 15 — see below |

The remainder (`S7776` array-as-Set for existence checks, `S6551`, `S7773`, `S4624`, and a long
tail of 1-3-count rules) are minor, scattered findings not worth a dedicated pass.

## Cognitive complexity (S3776) — the one category worth actively chasing

This is the only rule category where the metric tracks real bug risk rather than a style
preference: the deeper and more tangled a function's branching, the more likely a future edit
misses an edge case. It started at **20 issues** (worst: `generate-permit-pdf.ts` at **107** — the
single biggest outlier by a wide margin) and is now down to **1** after five fix passes:

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
3. **3 more API routes** (`data-users/[id]/route.ts` 20, `spe-providers/[id]/route.ts` 20,
   `spe-types/[id]/route.ts` 18) — all → 0. Byte-for-byte the same shape as #2's routes, fixed with
   the identical technique.
4. **2 lib files** (`hdeu.ts` 26, `ncp-client.ts` 21+17) — all → 0. `hdeu.ts`'s
   `createApplicationFromHdeuPayload` split into an applicant/system-user resolver, a pure
   `buildApplicationCreateData()`, and one function per conditional post-creation block (invoicing,
   attachments, dataset variables, related permits, tabulation plans, study cohorts, requested
   datasets). `ncp-client.ts`'s two flagged functions (`mapSection6Entry`, `mapMetadataToHdeuPayload`)
   are both pure NCP-metadata-to-`HdeuPayload` mappers — split by sub-object
   (`buildCohortEntry`/`buildControlEntry`/`buildRelativeEntry`) and by concern
   (`buildStudyCohortsFromSection6`, `buildInvoicingDetails`, `buildSection3Fields` — the last one
   collapsing 9 repeated `isNaturalPerson ? A : B` ternaries scattered across the function into one
   place). All extracted pure functions got direct unit tests, no mocking needed.
5. **7 files, 8 issues, all → 0** (`src/auth.ts` 20, `financials/page.tsx` 21, `permits/[id]/page.tsx`
   20, `StudyCohortExplorer.tsx` 31 and 18, `NewApplicationForm.tsx` 22, `DeadlineExtensionPanel.tsx`
   20, `PermitChangeRequestPanel.tsx` 17) — this session's dedicated pass on the 9 open findings
   left by the Keycloak re-run, minus the one explicitly deferred (see below). Same technique as
   passes 2-4: extract branching/derivation logic into small named helper functions in the matching
   domain `src/lib/*.ts` file (new: `auth-helpers.ts`, `application-form.ts`, `deadline-extension.ts`;
   extended: `invoice.ts`, `permit.ts`, `utils.ts`, `permit-change.ts`), guard-clause/early-return
   style, direct unit tests for every extracted function (82 new test cases across the 7 files'
   companion `*.test.ts` files), and — for the two components with JSX-shaped complexity
   (`StudyCohortExplorer.tsx`'s per-tab bodies, `DeadlineExtensionPanel.tsx`'s 4-level nested view
   ternary) — a small sub-component/view-state-enum split alongside the pure extraction. Every
   pre-existing `.test.tsx`/page still passes unchanged, confirming behavior-identical refactors.
   `src/app/[locale]/applications/[id]/page.tsx` (29) was explicitly excluded from this pass: unlike
   the other RSC pages, its complexity is JSX-structural (10 independent, interleaved sections) not
   extractable branching logic — fixing it properly needs a ~10-component structural split with no
   existing test safety net (the page has zero tests today), judged out of scope for a
   complexity-focused pass and left for a dedicated future session.

### Still open (1 issue, 1 file)

| File | Complexity | Category |
|---|---|---|
| `src/app/[locale]/applications/[id]/page.tsx` | 29 | RSC page (no existing tests) |

The last remaining entry is unchanged from every prior run — this is the one file this session
deliberately did not touch (see above). It's the only one left on this list with genuinely
JSX-structural, not logic, complexity, and the only one with no test coverage at all to refactor
against safely; recommend a dedicated session pairing the structural split with new component
tests, rather than folding it into a complexity-only pass.

## Duplication (4.5% overall — unchanged by this pass, still up from 2.8% pre-Keycloak)

All three clusters below are unchanged from the Keycloak re-run (verified directly against each
file's own duplication measure) — this pass touched none of them; the 0.1pp drop from 4.6% is just
the denominator effect of ~300 net new lines with zero new duplication. The one Keycloak-era
cluster below is a direct, understandable side effect of that session's own mechanical migration
(~44 API routes swapping their `userId` source for `await actingUserId()`), not a sloppy new
pattern:

- **New**: `src/app/api/applications/[id]/completeness-check/route.ts` and
  `.../assessment-check/route.ts` — 76.2% duplicated (the single highest cluster now). These two
  routes were already near-identical (parallel handlers for two similar checklist types); making
  their one differing line — how the acting user id is sourced — identical across both as part of
  the mechanical migration removed the last real difference the duplication detector could key off.
  A shared `handleChecklistUpdate()` helper parameterized by checklist type would resolve this.
  The same effect shows up, smaller, in `data-holders/[id]/route.ts` (32.2%),
  `spe-operators/[id]/route.ts` (31.8%), and `contacts/[id]/route.ts` (31.5%) — all PATCH/DELETE
  handler pairs that already shared a `build<X>UpdateData()` helper from an earlier pass, now also
  sharing the identical acting-user-id line.
- **Unchanged**: `src/app/api/invoices/[invoiceId]/route.ts` and
  `src/app/api/permits/[id]/invoices/[invoiceId]/route.ts` — 69.9%/68.9% duplicated (was 70-71%).
  Diffed directly: near-identical `PATCH` handlers, the only real difference is the permit-scoped
  one adds an `invoice.permitId !== id` ownership check. A shared `updateInvoiceStatus()` helper
  would resolve this in well under an hour.
- **Unchanged**: `AuditLogTable.tsx` / `SecurityLogTable.tsx` / `IntegrationLogTable.tsx` —
  53.7%/48.8%/35.8% duplicated (was 49-54%). Same table/`thead`/`tbody` wrapper markup in all
  three, differing only in columns and per-row cell content — a good candidate for a shared
  generic `<LogTable columns={...} rows={...}>` component now that three concrete usages exist.

The remaining duplication (53 files show some, most in the single digits) is scattered and not
worth chasing to zero on a reference-implementation project.

## What's not worth chasing

This is a community-built, unofficial EHDS/TEHDAS2 reference implementation (see the project
README's own disclaimer), not a production app under a maintainability SLA. Driving the 255 code
smells to zero — especially the 77 button-`type` and 65 readonly-prop findings, both real but
low-severity and mostly mechanical — is churn for its own sake past a certain point. The
recommendation from this assessment is updated: the cognitive-complexity list is now down to its
last entry (`applications/[id]/page.tsx`, 29 — deferred pending a dedicated structural-split
session, see above), so it's no longer the standing priority it was; fix the duplication clusters
above (three, one of them a direct consequence of the userId→session migration) next, and treat
the rest as opportunistic ("touch a file, fix it while you're there") rather than a dedicated pass.
