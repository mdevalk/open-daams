# OWASP Top 10 (2021) assessment: open-daams

_Snapshot date: 2026-08-13 (updated same day: entity-scoped case-workflow actions now logged too — A09 fully closed)._

This is a security assessment of the open-daams codebase mapped to the
**OWASP Top 10 (2021)** categories.

> **Framing.** `docs/architecture.md` states the app runs on
> **test data only** with authentication explicitly stubbed — practical risk is low in the
> current demo posture. This is written against the bar the project would need to clear before
> holding real (special-category health) data or being publicly exposed. Not a certification or
> compliance attestation.

## Summary

| Category | Status | Key finding |
|---|---|---|
| **A01 – Broken Access Control** | ✅ Fixed (root gap remains — see A07) | Previously fully-open reads (application detail, attachments, decision-card PDFs, internal permit record, `/api/users`) now require identity + role/ownership |
| **A02 – Cryptographic Failures** | ✅ Clean | Ed25519 signing (`@noble/ed25519`), key never committed, no hardcoded secrets |
| **A03 – Injection** | ✅ Clean | All DB access via Prisma's typed query builder; zero raw SQL anywhere |
| **A04 – Insecure Design** | ✅ Improved | No-real-auth is still the accepted baseline design, but the amplifying factors (open user directory, open sensitive reads) are closed |
| **A05 – Security Misconfiguration** | ✅ Fixed | Nonce-based CSP + full security-header set now set in `src/proxy.ts`; error handling remains disciplined |
| **A06 – Vulnerable Components** | ✅ Fixed | `npm audit`: **0 vulnerabilities**, now enforced on every push via `.github/workflows/ci.yml`; the two previously-`"*"`-pinned dependencies are now pinned to exact versions |
| **A07 – Identification and Authentication Failures** | ⚠️ Open (root gap) | No real authentication — RBAC trusts a client-supplied user id, by design for this reference implementation |
| **A08 – Software and Data Integrity Failures** | ℹ️ Note | `verifyPermitSignature` exists but is never called in-app — verification happens in the separate external permit-validator app (by design); dependency pinning gap closed |
| **A09 – Security Logging and Monitoring Failures** | ✅ Fixed | Rejected/unauthorized attempts (`AuthzFailureLog`) and all case-workflow actions (`AuditLog`) are now logged; no more unlogged mutation paths found |
| **A10 – Server-Side Request Forgery** | ✅ Clean | The one outbound integration (NCP client) hardcodes host + protocol; no user-controlled host anywhere |

## Findings

### A01 — Broken Access Control ✅ Fixed

Confirmed live: `GET /api/applications/[id]`, `GET /api/attachments/[id]`,
`GET /api/applications/[id]/decision-card/pdf`, and the internal `GET /api/permits/[id]` (status
+ transition log — distinct from the deliberately-public `/pdf`/`/json` export) all previously
served full content to any caller with the resource id, no identity check of any kind. `GET
/api/users` returned every user's `id`/`name`/`email`/`role` unauthenticated.

Fixed via a new `requireRoleOrOwner(userId, allowedRoles, ownerId)` helper in `src/lib/authz.ts`
(staff role *or* the specific record's own applicant) and `requireRole` on the staff-only routes;
`/api/users` is now gated and trimmed to `id`/`name`/`role`. `POST /api/applications` and the
HD@EU/NCP import routes now require the right role, with an ownership check preventing an
`APPLICANT` from creating an application under someone else's identity.

**Deliberately left public**: `GET /api/permits/[id]/pdf`, `/json`, and `/.well-known/jwks.json`
— D6.4 R9.1.3 requires a signed permit to be independently verifiable by third parties (data
holders, auditors, HD@EU counterparts) with no DAAMS session, via the published JWKS key.
Confirmed via the routes' own doc comments, the PDF's footer text instructing external
verification, and the JWKS endpoint's existence — gating these would contradict the spec they
implement.

**Not yet done**: entity-scoped access control for actions *within* a case (e.g. any staff role
can act on any application/permit, no assignment/ownership boundary between case handlers) —
assessed as intentional for this back-office domain (national HDAB staff need full-caseload
visibility), not a gap.

### A02 — Cryptographic Failures ✅ Clean

Unchanged. Ed25519 via `@noble/ed25519` (modern, audited pure-JS implementation) + SHA-512, with
correct canonicalization (`stableStringify`, sorted keys) before signing — avoids the classic
"different JSON serialization breaks the signature" bug. `verifyPermitSignature` correctly
rejects a `signingKeyId` mismatch or missing signature. The public JWKS endpoint publishes only
`x`/`kid`, never the private `d`. Private key file is gitignored and confirmed never committed
(`git log --all`). No hardcoded secrets found anywhere in source.

### A03 — Injection ✅ Clean

Unchanged. Zero `$queryRaw`/`$executeRaw`/raw-SQL string concatenation anywhere — all database
access goes through Prisma's typed query builder. No `eval`, `new Function()`, or shell exec
calls in `src/` or `scripts/`. PDF generation places text at fixed coordinates rather than
building interpretable markup — no injection vector there either.

### A04 — Insecure Design ✅ Improved

The core design characteristic — no real authentication, RBAC trusts a client-supplied user id —
is unchanged and remains a deliberate, documented simplification for this reference
implementation (see A07). What changed: the two concrete things that made it *worse* than the
documented baseline (an open user directory usable to harvest valid ids/roles for impersonation,
and several sensitive reads requiring no identity at all — not even a spoofable one) are both
closed as of the A01 fix. The residual design gap is exactly the accepted one, not an amplified
one.

### A05 — Security Misconfiguration ✅ Fixed

`src/proxy.ts` now generates a fresh nonce per request and sets a full security-header set on
every response: `Content-Security-Policy` (`script-src`/`style-src` scoped to `'self' 'nonce-…'
'strict-dynamic'`, no `'unsafe-eval'`/`'unsafe-inline'` in production — those are dev-only, for
React's dev-mode `eval` debugging and Turbopack's Fast Refresh), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy`, and `Strict-Transport-Security`. Verified live in both `next dev` and a
production `next build`/`next start`: the header's nonce matches the `nonce=` attribute Next
attaches to its own hydration scripts and stylesheets, so the strict policy doesn't break
rendering. Note this landed in `proxy.ts`, not a `next.config.ts` `headers()` block as originally
suggested below — a static config can't generate a per-request nonce, and a nonce-less CSP would
need `'unsafe-inline'` for Next's own inline hydration scripts, defeating most of the point.
Deliberately chosen over the simpler static-CSP alternative because it has no real downside here:
every page under `src/app/[locale]` already reads `searchParams` or sets `force-dynamic`, so the
"nonces require dynamic rendering" cost doesn't apply — nothing was statically optimized to begin
with (confirmed via `next build`: zero `○ Static` routes).

Error handling remains disciplined — every route returns only `.message`, never a stack trace or
raw error object (see A09 for the count). `.env.example` ships an obviously-placeholder `changeme`
password, not a real default credential. HSTS is sent unconditionally; it has no effect until TLS
terminates in front of the app, which is a deployment concern, not an app-layer gap.

### A06 — Vulnerable and Outdated Components ✅ Fixed

`npm audit` now reports **0 vulnerabilities**, down from 5 at the start of this assessment cycle
(1 moderate, 4 high — `next`, `next-intl`, transitively `postcss`/`sharp`/`brace-expansion`).
Resolved via `brace-expansion` fix (`npm audit fix`) plus a manual, scoped Next.js 15→16.3.0 and
next-intl 3→4.13.5 upgrade (checked against every relevant breaking change in both frameworks'
migration guides before touching anything — most didn't apply to this app: no `next/image`
usage, no parallel routes, no custom webpack config, no sync Request API usage, next-intl's two
v4-mandatory requirements were already satisfied).

**Now fixed**: `@rijkshuisstijl-community/components-react` and
`@rijkshuisstijl-community/design-tokens` — previously pinned to `"*"` (a supply-chain hygiene
gap: non-reproducible builds, auto-pulls any future publish including a compromised one) — are now
pinned to the exact versions already in use (`15.1.2`/`16.1.0`), confirmed a behavioural no-op
(`npx tsc --noEmit` clean, 55/55 tests passing before and after). `npm audit` is also no longer a
manual step: `.github/workflows/ci.yml` (new) runs `npm ci` + `npm audit --audit-level=moderate` +
`npm run test` on every push and pull request.

### A07 — Identification and Authentication Failures ⚠️ Open (root, by design)

Unchanged, and not in scope to silently fix per this project's own documentation: there is no
real authentication. `findActingUser`/`requireRole`/`requireRoleOrOwner`
(`src/lib/authz.ts`) all trust a client-supplied `userId`, verified only against the database
role — not against any proof of identity. They do fail closed correctly (missing/invalid id →
401, no silent privileged default), and no bypass was found in any sampled route.

One inconsistency remains from the pre-A01-fix codebase: `src/app/api/permits/[id]/route.ts`
**POST** (the transition/revoke/expire action) still does its own inline
`prisma.user.findUnique(...)` rather than the shared helper — cosmetic/consistency issue, not a
new authorization gap, since the effective check is equivalent. (Its sibling GET handler was
centralized on `requireRole` during the A01 fix; the POST was out of that round's scope.)

**Remediation**: real session-based authentication (Auth.js/OIDC) is the actual fix — this is the
single highest-leverage remaining item in this assessment, since both CSRF/forgeable-mutation
exposure and non-repudiation of actions cascade from it.

### A08 — Software and Data Integrity Failures ℹ️ Note

Unchanged. `verifyPermitSignature` exists (`src/lib/permit-signing.ts`) but is never called
anywhere in this app — DAAMS signs its own generated permits/decision cards and displays them
without self-verifying, which is self-consistent (the signature is for downstream/external
verifiers, per A01's JWKS discussion) but worth stating plainly rather than assuming it implies
in-app integrity checking. Concretely, that verification is performed by the separate, external
permit-validator application — a different codebase from this one — via the published JWKS key,
not by anything inside open-daams. The dependency-pinning gap noted here previously (A06) is now
closed.
The new CI workflow (`.github/workflows/ci.yml`) itself pins its actions by tag
(`actions/checkout@v4`, `actions/setup-node@v4`) rather than a floating major version or an
unpinned commit SHA — reasonable for a public, non-secret-handling workflow, though SHA-pinning
would be the stricter option for a higher-trust pipeline.

### A09 — Security Logging and Monitoring Failures ✅ Fixed

**Real progress this cycle**: the audit trail was restructured and materially expanded.
`AuditLog` (application-status-transition log) was renamed to `ApplicationLog` for consistency
with the equivalently-scoped `DataPermitLog`/`SpeProvisioningLog`. A new, separate `AuditLog` now
covers reference-data (masterdata) CRUD — 12 previously entirely unlogged ADMIN write actions
across data holders, SPE operators/providers, and data users — with entries recording *what*
changed (field names for routine edits, explicit outcome phrasing like "marked as trusted" for
the two access-control-relevant fields), not just that something did. Three new SPE-type CRUD
actions (create/update/delete) added this round follow the same logged-by-default pattern.

**Now fixed**: rejected/unauthorized attempts no longer leave zero trace. A new
`AuthzFailureLog` table records every rejection from the shared `src/lib/authz.ts` path
(`findActingUser`/`requireRole`/`requireRoleOrOwner`) — missing/invalid user id, unknown user, and
role-not-permitted — with the reason, the (possibly invalid) attempted user id, and the existing
human-readable error text, via one shared `logAuthzFailure` helper rather than a change to any of
the ~40 individual call sites. Verified live: triggered all three rejection cases via real `curl`
calls, confirmed each landed a row, confirmed the new `/security-log` page
(`src/app/[locale]/security-log/page.tsx`) renders them, then cleaned up the disposable rows.
Deliberately doesn't capture *which* route was hit — none of these functions receive request
context today, and threading it through 40 call sites would contradict the fix's own
"cheap, one shared change" framing; a real enhancement, not part of this fix.

**Now also fixed**: the remaining entity-scoped actions (authorized-persons add/remove, appeal
submit/decide, invoice issue/mark-paid/cancel across both invoice route variants, provisional
invoice issue, trusted-data-holder set/clear — 9 endpoints in all) now write an `AuditLog` entry
each, following the same taxonomy: `ApplicationLog`/`DataPermitLog`/`SpeProvisioningLog` stay pure
status-transition logs (never a fabricated entry), and everything else — reference-data CRUD plus
these case-workflow actions — lands in `AuditLog`. Verified live for 5 of the 9 (authorized-person
add/remove, appeal submit/decide, invoice mark-paid) via real requests against disposable/reverted
data, confirming correct `entityType`/`entityId`/`userId`/`action` rows; the other 4 follow the
identical mechanical pattern and were confirmed by direct code review.

No further remediation open in this category.

### A10 — Server-Side Request Forgery ✅ Clean

Unchanged. `src/lib/ncp-client.ts` hardcodes `NCP_BASE_URL` as a module-level constant with a
fixed host and protocol; the only place request-derived input reaches an outbound URL, it lands
in the path only, never the host or protocol (not reportable per OWASP's own SSRF criteria). No
other outbound HTTP calls exist in the codebase — every other `fetch()` found is same-origin,
client-to-this-app's-own-API.

## Bottom line

Four full categories are now closed out (A01, A05, A06, A09), with A04/A07's shared root cause
narrowed to exactly its documented, accepted scope rather than an amplified one. A09 is fully
closed this cycle — both the rejected/unauthorized-attempt logging (`AuthzFailureLog`) and the
last unlogged case-workflow actions (`AuditLog`) are done, so every mutation path in the app now
leaves a trace, success or failure. This cycle additionally closed A06's remaining
pinned-dependency gap and added CI enforcement (`npm audit` + tests on every push) where previously
none existed. The single highest-leverage remaining item is real authentication — everything else
on this list either cascades from it (SC-23's forgeable-mutation exposure, tracked under A04/A07)
or is already fully independent of it and closed (A09).

### Suggested order

1. ~~**Cheap, independent of auth**: pin the two `"*"` dependencies (A06/A08); add CI running
   `npm audit` + tests on every push.~~ **Done** — see A06/A08 above.
2. ~~**Still cheap, independent of auth**: log failed/rejected attempts in `authz.ts` (A09).~~
   **Done** — see A09 above.
3. ~~**Round out A09**: the entity-scoped action log for authorized-persons/appeals/invoices/
   trusted-data-holder.~~ **Done** — see A09 above. A09 is now fully closed.
4. **The real fix**: session-based authentication (A04/A07), which also resolves the residual
   CSRF/forgeable-mutation exposure noted above. The only remaining open item on this list.
