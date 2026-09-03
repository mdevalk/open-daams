# SonarQube assessment: open-daams

_Snapshot date: 2026-08-21 (updated same day: 3 more API routes and 2 lib files' cognitive
complexity fixed — 14 → 8 CRITICAL issues remaining). Re-run 2026-08-30 after the Keycloak/OIDC
authentication integration (~1,000 net new lines across ~100 files) — 8 → 9 CRITICAL. Re-run again
2026-08-30 (same day, second pass) after a dedicated cognitive-complexity pass covering 7 of the
9 open findings (8 issues; `applications/[id]/page.tsx` explicitly deferred, see below) — 9 → 1
CRITICAL. Re-run 2026-09-03 after the deferred structural split of that one remaining file — 1 → **0**
CRITICAL. Re-run again 2026-09-03 (same day) after a sweep adding `type="button"` to all 77
`S9011` findings — code smells 266 → 189; see "Multi-Quality Mode ratings" below for why the
Reliability rating didn't move. Re-run three more times 2026-09-03 (same day) closing all 14
remaining MQR Reliability issues in three batches (9 MEDIUM-severity mechanical fixes, 4
LOW-severity mechanical fixes, then the one remaining `S8786` regex rewrite) — MQR Reliability
rating **C → A**. Re-run once more 2026-09-03 (same day) after resolving the 3 duplication clusters
plus the `S6582`/`S9020` code smells — duplication 4.3% → **2.8%**, code smells 175 → **145**.
Re-run once more 2026-09-03 (same day) after a final zero-risk sweep — 3 unused imports removed
(`S1128`), 2 duplicate imports merged (`S3863`), 3 built-in imports given the `node:` protocol
prefix (`S7772`) — code smells 145 → **137**._

This is a static-analysis assessment of the open-daams codebase against **SonarQube Community
Edition**'s default TypeScript/JavaScript rule set — bugs, vulnerabilities, security hotspots,
maintainability code smells, duplication, and test-coverage integration. It complements the other
`docs/*-assessment.md` documents (OWASP/NIS2/BIO2 cover security posture from a different angle;
this one is closer to code-quality/maintainability), same "assessment, not certification" framing.

> **Method.** Through the 2026-08-30 runs, this was a throwaway **SonarQube Community Edition**
> Docker container (`sonarqube:community`, embedded H2 database) started fresh per session. As of
> 2026-09-03 it's a **persistent** `sonarqube` service in `docker-compose.yml` (named volumes for
> data/extensions/logs, port 19000 on the host — 9000 was already taken locally), kept running so
> the ICTU quality-time dashboard can poll it continuously; still embedded H2, still fine for one
> local user, not a multi-user production setup. Either way, scanned via `npx sonarqube-scanner`
> against `sonar-project.properties` (committed at the repo root, `sonar.projectKey=open-daams`)
> with real coverage data from `npx vitest run --coverage` (the `lcov` reporter already configured
> in `vitest.config.mts`). **Not wired into CI** — this is a manual, occasional check, not a build
> gate. One methodological note worth flagging for anyone repeating this: SonarQube's issue-tracker
> can display **stale** per-function complexity numbers when re-analyzing the *same* project after a
> structural fix (it appears to carry forward the previous issue's message text under some
> conditions — seen again on the 2026-09-03 run) — always delete and recreate the project (`POST
> /api/projects/delete`, then rescan — SonarQube auto-provisions the project on the next analysis)
> before trusting a "did this fix actually work" comparison; a same-project rescan is fine for
> headline/aggregate metrics.

## Summary

| Metric | Result (2026-08-21) | Result (2026-08-30, Keycloak) | Result (2026-08-30, S3776 pass) | Result (2026-09-03, JSX split) | Result (2026-09-03, S9011 pass) | Result (2026-09-03, MQR closure) | Result (2026-09-03, dup/S6582/S9020) | Result (2026-09-03, zero-risk sweep) |
|---|---|---|---|---|---|---|---|---|
| Bugs | **0** (Reliability A) | **0** (Reliability A) | **0** (Reliability A) | **0** (Reliability A) | **0** (Reliability A, legacy model) | **0** (Reliability A, both models) | **0** (Reliability A, both models) | **0** (Reliability A, both models) |
| Vulnerabilities | **0** (Security A) | **0** (Security A) | **0** (Security A) | **0** (Security A) | **0** (Security A) | **0** (Security A) | **0** (Security A) | **0** (Security A) |
| Security hotspots | **0** (Security Review A) | **0** (Security Review A) | **0** (Security Review A) | **0** (Security Review A) | **0** (Security Review A) | **0** (Security Review A) | **0** (Security Review A) | **0** (Security Review A) |
| Maintainability rating | **A** | **A** | **A** | **A** | **A** | **A** | **A** | **A** |
| MQR Reliability rating | n/a | n/a | n/a | n/a | C | A | A | A |
| Code smells | 252 | 268 | 255 | 266 | 189 | 175 | 145 | **137** |
| — of which CRITICAL severity | 8 | 9 | 1 | **0** | 0 | 0 | 0 | 0 |
| Cognitive-complexity issues (rule S3776) | 8 | 9 | 1 | **0** | 0 | 0 | 0 | 0 |
| Button-`type` issues (rule S9011) | n/a | 77 | 77 | 77 | **0** | 0 | 0 | 0 |
| MQR Reliability-impact issues | n/a | n/a | n/a | n/a | 91 → 14 | 0 | 0 | 0 |
| Optional-chaining issues (rule S6582) | 8 | 8 | 8 | 8 | 8 | 8 | **0** | 0 |
| Testing Library style (rule S9020) | 20 | 23 | 23 | 23 | 23 | 23 | **0** | 0 |
| Unused/duplicate imports, missing `node:` prefix | n/a | n/a | n/a | n/a | n/a | n/a | 8 | **0** |
| Duplicated lines | 2.8% | 4.6% | 4.5% | 4.3% | 4.3% | 4.3% | **2.8%** | 2.8% |
| Test coverage (line, via lcov) | ~45-48%* | 46.0% | 47.7% | 49.1% | 49.1% | 49.2% | 50.5% | 50.5% |
| Lines of code analyzed | ~15,400 | 16,369 | 16,659 | 16,913 | 16,940 | 16,958 | 17,057 | 17,057 |
| Maintainability debt (`sqale_index`) | ~1,193 min (~19.9h) | 1,257 min (~21.0h) | 1,143 min (~19.1h) | 1,184 min (~19.7h) | 1,030 min (~17.2h) | 933 min (~15.6h) | 783 min (~13.1h) | **763 min (~12.7h)** |

\* Coverage fluctuates a few points run-to-run depending on which files were touched most recently
in the same session; treat it as "mid-to-high 40s%," not a fixed number.

**Headline takeaway**: zero bugs, vulnerabilities, or security hotspots, and all three
reliability/security ratings stay A across every re-run so far, Keycloak integration included. The
2026-08-30 cognitive-complexity pass covered all 9 open findings from the Keycloak re-run except
one — `applications/[id]/page.tsx` (29), explicitly deferred, see below — i.e. 8 findings across
7 files (`StudyCohortExplorer.tsx` alone carried 2 of the 9). It took CRITICAL findings from 9 down
to 1, added real new test coverage (+1.7pp) rather than just moving code around, and — as a side
effect of extracting branching logic into named helpers — also *reduced* two other smells that
weren't directly targeted: nested ternaries (S3358) 29 → 18, and `sqale_index` debt actually
dropped below even the pre-Keycloak 08-21 baseline. The 2026-09-03 JSX-split pass then closed the
one deliberately-deferred file — see below — taking CRITICAL findings from 1 to **0**. Verified
against a freshly recreated SonarQube project (not a same-project rescan) to rule out the
stale-issue display quirk noted under Method above; code smells (266), duplication (4.3%), and
`sqale_index` (1,184 min) all stayed in the same range as the prior pass, since a structural JSX
split moves code around rather than removing or adding much of it. A same-day follow-up pass then
added `type="button"` to all 77 `S9011` findings (verified none sit inside an actual `<form>`, so
none needed `type="submit"` instead — see below), taking code smells 266 → 189 and `sqale_index`
down further — but revealed the MQR Reliability rating was C (91 issues), unaffected by legacy-model
"Reliability A." Three more same-day passes then closed that out entirely (see "Multi-Quality Mode
ratings" below for the full breakdown): the 9 mechanical MEDIUM-severity fixes, then 4 LOW-severity
ones, then the one remaining `S8786` regex rewrite — taking MQR Reliability issues 91 → 0 and the
rating **C → A**. A final same-day pass then resolved the 3 documented duplication clusters (new
`handleChecklistUpdate()`/`updateInvoiceStatus()` helpers and a generic `<LogTable>` component) plus
all 8 `S6582` and all 23 `S9020` findings — duplication 4.3% → **2.8%** (back to the pre-Keycloak
baseline), code smells 175 → 145, and `sqale_index` down further. A final same-day sweep then closed
3 more genuinely zero-risk findings — 3 unused imports (`S1128`, confirmed unreferenced anywhere
else in each file), 2 duplicate imports merged into one (`S3863`), 3 built-in Node imports given the
`node:` protocol prefix (`S7772`, a no-op at runtime) — taking code smells 145 → **137** and
`sqale_index` to its lowest point across every run in this doc.

## Where the 137 code smells concentrate

Only two rules are left with any real count. `S6759` (readonly props, 80) is deliberately untouched
— see "What's not worth chasing" below for why. Everything else this project has actively targeted
is now at zero:

| Rule | Count (08-21) | Count (08-30, Keycloak) | Count (08-30, S3776 pass) | Count (09-03, JSX split) | Count (09-03, S9011 pass) | Count (09-03, MQR closure) | Count (09-03, dup/S6582/S9020) | What it flags |
|---|---|---|---|---|---|---|---|---|
| `typescript:S6759` | 57 | 60 | 65 | 79 | 79 | 79 | **80** | React component props not typed `Readonly<...>` — pre-existing convention across the codebase, deliberately left alone (see below); the +1 is the new `LogTable.tsx` shared component following that same existing convention |
| `typescript:S3358` | 27 | 29 | 18 | 18 | 18 | 18 | 18 | Nested ternary operators (readability) — not yet in scope for a dedicated pass |
| `typescript:S9020` | 20 | 23 | 23 | 23 | 23 | 23 | **0** | Testing Library `find*` vs `get*`/`query*` misuse (test files). Fixed 2026-09-03: all 23 were the identical `waitFor(() => expect(screen.getByText(...)).toBeInTheDocument())` shape, mechanically rewritten to `expect(await screen.findByText(...)).toBeInTheDocument()`; 5 files' now-unused `waitFor` import removed |
| `typescript:S6582` | 8 | 8 | 8 | 8 | 8 | 8 | **0** | Optional-chaining preference. Fixed 2026-09-03: all 8 were the `!x \|\| !x.y` (or `!x \|\| x.y !== id`) guard-clause shape, which is safe to rewrite as `!x?.y` regardless of `x`'s type (unlike the riskier `x && x.y` → `x?.y` direction, where a falsy-but-defined `x` changes behavior) |
| `typescript:S9011` | 70 | 77 | 77 | 77 | **0** | 0 | 0 | `<button>` elements missing an explicit `type` attribute. Fixed 2026-09-03: `type="button"` added to all 77 — verified none sit inside an actual `<form>`, so `type="submit"` was never the right call for any of them |
| `typescript:S7773`/`S8786`/`S6853`/`S7758`/`S7781` | n/a | n/a | n/a | n/a | 14 | **0** | 0 | The MQR-Reliability-impact tail — see "Multi-Quality Mode ratings" below for the full breakdown and fix approach for each |
| `typescript:S3776` | 8 | 9 | 1 | **0** | 0 | 0 | 0 | Cognitive complexity over the default threshold of 15 — see below |

The remainder (`S7776` array-as-Set for existence checks, `S6551`, `S4624`, and a long tail of
1-3-count rules) are minor, scattered findings not worth a dedicated pass.

## Cognitive complexity (S3776) — fully resolved

This was the only rule category where the metric tracked real bug risk rather than a style
preference: the deeper and more tangled a function's branching, the more likely a future edit
misses an edge case. It started at **20 issues** (worst: `generate-permit-pdf.ts` at **107** — the
single biggest outlier by a wide margin) and is now down to **0** after six fix passes:

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
6. **The deferred file, `applications/[id]/page.tsx`** (29 → 0) — the dedicated structural-split
   session recommended above. Its ~1,000 lines of JSX were split into 14 named, exported section
   components (`CompletenessSection`, `CaseManagementSection`, `ProjectDescriptionSection`,
   `TransferAndProcessingSection`, etc.), each replacing an inline `{condition && (...)}` render
   gate with an early-return guard clause — the same technique passes 2-5 used for logic branching,
   applied here to JSX structure instead. That resets SonarJS's nesting-depth penalty to zero at
   each section boundary, so the parent page — now a flat sequence of component calls — carries
   almost none of the original complexity itself. Unlike the other files in this list, this page had
   zero tests before the pass; 18 new RTL tests (`page.test.tsx`) now cover every section with a
   render-gating condition (renders nothing when the guard is false, renders content when true).
   Verified behavior-identical via a manual browser check of a data-rich application (all ten
   populated sections, sidebar panels, and history rendered exactly as before) rather than a
   snapshot test, since RSC pages don't support one directly.

### Still open

None. The list above (six passes, 20 → 0) covers every cognitive-complexity finding this project
has had since the first assessment.

## Multi-Quality Mode ratings — resolved (C → A)

This local instance has `sonar.multi-quality-mode.enabled = true`, discovered 2026-09-03 by
comparing the SonarQube UI's project-overview card against this doc's own API-sourced numbers: the
UI showed **Reliability C** while the legacy `reliability_rating` metric (issues typed `BUG` only)
said **A** with 0 bugs — both correct, just answering different questions. Under MQR, any issue can
carry a per-quality *impact* independent of its legacy type/severity, so `CODE_SMELL`-typed issues
can (and here, do) drag the Reliability or Security rating down even with zero legacy bugs or
vulnerabilities. The MQR-specific metric keys are `software_quality_{reliability,security,
maintainability}_rating` (plus `_issues` for counts) — distinct from the legacy `reliability_rating`
/`security_rating`/`sqale_rating` this doc used through the 09-03 JSX-split row above. **Anyone
pointing an external tool (e.g. ICTU quality-time) at this instance should check which metric key
it requests** — the two models can disagree by a full letter grade.

The 2026-09-03 S9011 pass (77 → 0) was chosen partly *because* `S9011` was 77 of the 91
Reliability-impacting issues MQR reported at the time. After the fix, `software_quality_
reliability_issues` dropped 91 → 14 — but `software_quality_reliability_rating` **stayed at C**,
unchanged. Reason: SonarQube's rating (both legacy and MQR) is driven by the *worst* severity
present, not a count. 10 of the remaining 14 were still MEDIUM severity, and even one MEDIUM-severity
issue holds a C regardless of how many LOW ones are also cleared:

| Rule | Count | Severity | What it flags | Fix |
|---|---|---|---|---|
| `typescript:S7773` | 6 | MEDIUM | Prefer `Number.parseInt` over the global equivalent | Mechanical: `parseInt` → `Number.parseInt` (identical function, per spec) at all 6 call sites (3× `ncp-client.ts`, 3× API route sequence-number generators) |
| `typescript:S8786` | 3 | MEDIUM | Regex susceptible to non-linear (catastrophic) backtracking | Traced each individually rather than batching (see below) — 2 of the 3 had a genuine quadratic shape, 1 didn't |
| `typescript:S6853` | 1 | MEDIUM | `<label>` missing an associated form control | `NewApplicationForm.tsx`'s radio-option label nests its visible text two `<div>`/`<p>` levels deep, which the static checker's text-detection didn't recurse into (the text *is* genuinely there and accessible at runtime — verified this isn't a real a11y bug). Added an explicit `aria-label` directly on the `<input>` as a belt-and-suspenders fix, satisfying the rule without restructuring the visible layout |
| `typescript:S7758` | 1 | LOW | Prefer Unicode-aware string methods | Mechanical: `String.fromCharCode(b)` → `String.fromCodePoint(b)` while building a base64 string byte-by-byte from a `Uint8Array` — byte values are always 0-255, identical behavior for both functions in that range |
| `typescript:S7781` | 3 | LOW | Prefer `replaceAll()` over `replace()` with a global regex | Mechanical: `.replace(/\//g, '-')` → `.replaceAll('/', '-')` at 3 filename-sanitizing call sites (decision-card PDF, permit JSON, permit PDF routes) — functionally identical, skips invoking the regex engine entirely for a single-literal-character match |

**The `S8786` findings, individually:**
- Two (`PermitChangeRequestPanel.tsx`, both `pathname.replace(/[^/]+$/, id)`, swapping the trailing
  path segment to navigate to a different permit version) had a *real* quadratic shape: the trailing
  `$` anchor forces the regex engine to backtrack-and-recheck "am I exactly at the end?" at every
  candidate match length, at every starting position, for any input that doesn't cleanly match.
  Fixed by replacing both with a small `replaceLastPathSegment()` helper using `lastIndexOf('/')` +
  `slice()` — no regex at all, verified byte-for-byte identical to the original across edge cases
  (empty string, no trailing segment, string ending in `/`, no slash anywhere) with a standalone
  comparison script before touching the component.
- One (`slugify()` in `api/permits/route.ts`, building `urn:objectstore:bucket:<slug>` references)
  did *not* have that shape: its pattern (`/[^a-z0-9]+/g`) has nothing mandatory following the
  quantified group, so a match either succeeds immediately or fails in O(1) — there's no
  backtrack-and-retry scenario, unlike the `$`-anchored pair above. This one is very likely
  SonarQube's static heuristic flagging "any unanchored quantified group" structurally rather than a
  proven worst-case complexity issue, and the input (data holder/dataset masterdata names) isn't
  attacker-facing either way. Fixed anyway, on request, by rewriting `slugify()` as a character-scan
  loop instead of a regex chain — genuinely eliminates the concern regardless of whether it was a
  real bug, verified against the original across 24 cases (empty/whitespace-only/unicode/emoji/mixed
  case/a 1000-char stress string) with zero mismatches, plus the existing `route.test.ts` assertions
  on the generated `urn:` strings still pass unchanged.

All three batches (the 9 MEDIUM fixes; the 4 LOW fixes; the `S8786` rewrite) were verified with a
fresh-project rescan each: `tsc --noEmit` clean, full test suite unaffected (554/554 every time),
0 new CRITICAL/BLOCKER findings. `software_quality_reliability_issues` went 14 → 5 → 1 → **0**, and
`software_quality_reliability_rating` **C → A** on the final rescan — MQR now agrees with the legacy
model across all three qualities (Reliability, Security, Maintainability all A).

## Duplication (2.8% overall — all 3 documented clusters resolved, back to the pre-Keycloak level)

The three clusters tracked since the Keycloak re-run were fixed 2026-09-03, each exactly the way
this doc had already recommended:

- **`completeness-check`/`assessment-check` routes** (was 76.2% duplicated) — extracted into
  `handleChecklistUpdate(req, id, { delegate, auditLabel, kind })` in new `src/lib/checklist.ts`,
  parameterized by the Prisma delegate (`completenessCheck`/`assessmentCheck` — schema-verified
  structurally identical, see `prisma/schema.prisma`) and the two Dutch audit-label strings. Each
  route is now a 3-line call. One TypeScript wrinkle: calling a method on a union of two generic
  Prisma delegates isn't allowed even when the underlying models match, so the upsert call needs one
  narrow, documented type cast — noted inline in `checklist.ts`. 6 new unit tests
  (`checklist.test.ts`) plus a manual browser verification (checked all items, added remarks,
  submitted, confirmed the state round-tripped through a page reload).
- **The two invoice `PATCH` routes** (was 69.9%/68.9% duplicated) — extracted into
  `updateInvoiceStatus(invoice, action)`, added to the existing `src/lib/invoice.ts` (already the
  established home for invoice domain logic, including database calls — see `auth-helpers.ts` for
  the same "domain file, not purity" precedent). Each route now just looks up + scopes the invoice
  (the permit-scoped one keeps its extra `invoice.permitId !== id` check) and delegates the rest.
  6 new unit tests (`invoice.test.ts`) covering every branch (both actions × permitted/rejected/
  wrong-status, plus the unknown-action case).
- **`AuditLogTable.tsx`/`SecurityLogTable.tsx`/`IntegrationLogTable.tsx`** (was 53.7%/48.8%/35.8%
  duplicated) — extracted a generic `<LogTable rows={...} columns={[{key, header, render,
  className}]} emptyMessage={...}>` shell (new `src/components/LogTable.tsx`). Each table keeps its
  own translations, column set, and per-cell rendering (badges, links, fallback dashes); only the
  wrapper `<div>`/`<table>`/`<thead>`/`<tbody>` markup and empty-state are shared. All 10 pre-existing
  tests across the three tables pass unchanged, confirming identical rendering.

Verified with a fresh-project rescan: duplication 4.3% → **2.8%** (`AuditLogTable.tsx` itself now
measures 0.0%, down from 53.7%), and — since these three clusters accounted for most of the
post-Keycloak increase — this brings the project back in line with the 2.8% pre-Keycloak baseline
from the very first assessment.

The remaining duplication (scattered, mostly single digits per file) is not worth chasing to zero
on a reference-implementation project.

## What's not worth chasing

This is a community-built, unofficial EHDS/TEHDAS2 reference implementation (see the project
README's own disclaimer), not a production app under a maintainability SLA. Every structural
category this doc has tracked is now closed: cognitive complexity, button-type, the whole MQR
Reliability tail, duplication, and every genuinely zero-risk mechanical finding are all at
zero/baseline — every rating (legacy and MQR, all three qualities) is A. What's left (137 code
smells) is deliberately not being chased further:

- **`S6759` (80, readonly props) — skipped on purpose, not an oversight.** This isn't a defect, it's
  a style convention the codebase has consistently *not* adopted anywhere — including every
  component added across this whole session's work, `LogTable.tsx` included. Converting it
  piecemeal as part of a maintainability cleanup would leave the codebase in a worse, inconsistent
  state than either extreme. Adopting `Readonly<...>` project-wide is a legitimate call to make, but
  it's a deliberate convention decision, not a bug fix — not folded in here.
- **`S3358` (18, nested ternaries)** — the one item from the earlier priority list not yet actioned.
  Real readability value, needs individual judgment (extract into a named variable/function, same
  technique as the cognitive-complexity work), unlike the mechanical sweeps done so far.
- **The long tail (scattered 1-3-count rules)** — not worth a dedicated pass regardless; fine
  opportunistically ("touch a file, fix it while you're there").
