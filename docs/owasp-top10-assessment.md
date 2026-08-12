# OWASP Top 10 (2021) assessment: open-daams

_Snapshot date: 2026-08-12 (previous snapshot: 2026-08-07)._

This is a security assessment of the open-daams codebase mapped to the
**OWASP Top 10 (2021)** categories. It complements `docs/nist-assessment.md` (NIST SP 800-53r5
control families) — the two overlap in places (e.g. OWASP A09 ≈ NIST AU-2/AU-3/AU-9/AU-10) but
are organized differently and are each useful in their own right.

> **Framing.** Same as the NIST assessment: `docs/architecture.md` states the app runs on
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
| **A05 – Security Misconfiguration** | ⚠️ Open | No CSP/security headers configured; error handling is otherwise disciplined (never leaks stack traces) |
| **A06 – Vulnerable Components** | ✅ Fixed | `npm audit`: **0 vulnerabilities** (was 5 at the start of this cycle) — Next.js 16.3.0, next-intl 4.13.5 |
| **A07 – Identification and Authentication Failures** | ⚠️ Open (root gap) | No real authentication — RBAC trusts a client-supplied user id, by design for this reference implementation |
| **A08 – Software and Data Integrity Failures** | ℹ️ Note | `verifyPermitSignature` exists but is never called in-app (self-issuer trust, by design); 2 dependencies pinned to `"*"` |
| **A09 – Security Logging and Monitoring Failures** | ⚠️ Open | Audit coverage expanded significantly this cycle, but only successful actions are logged — rejected/unauthorized attempts leave no trace |
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

### A05 — Security Misconfiguration ⚠️ Open

Unchanged. `next.config.ts` has no `headers()` block — no Content-Security-Policy, HSTS,
X-Frame-Options, or X-Content-Type-Options; TLS is left entirely to the deployment platform.
Error handling is disciplined everywhere sampled — every route returns only `.message`, never a
stack trace or raw error object. `.env.example` ships an obviously-placeholder `changeme`
password, not a real default credential.

**Remediation**: add a `headers()` block in `next.config.ts` — cheap, meaningful defense against
XSS/clickjacking.

### A06 — Vulnerable and Outdated Components ✅ Fixed

`npm audit` now reports **0 vulnerabilities**, down from 5 at the start of this assessment cycle
(1 moderate, 4 high — `next`, `next-intl`, transitively `postcss`/`sharp`/`brace-expansion`).
Resolved via `brace-expansion` fix (`npm audit fix`) plus a manual, scoped Next.js 15→16.3.0 and
next-intl 3→4.13.5 upgrade (checked against every relevant breaking change in both frameworks'
migration guides before touching anything — most didn't apply to this app: no `next/image`
usage, no parallel routes, no custom webpack config, no sync Request API usage, next-intl's two
v4-mandatory requirements were already satisfied).

**Still open**: `@rijkshuisstijl-community/components-react` and
`@rijkshuisstijl-community/design-tokens` remain pinned to `"*"` — a supply-chain hygiene gap
(non-reproducible builds, auto-pulls any future publish including a compromised one), not a
known-vulnerability gap. Tracked in `docs/nist-assessment.md` finding #5 (RA-5/SR-3).

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
single highest-leverage remaining item across both this assessment and the NIST one, since SC-23
(CSRF/forgeable mutations) and AU-10 (non-repudiation) both cascade from it.

### A08 — Software and Data Integrity Failures ℹ️ Note

Unchanged. `verifyPermitSignature` exists (`src/lib/permit-signing.ts`) but is never called
anywhere in this app — DAAMS signs its own generated permits/decision cards and displays them
without self-verifying, which is self-consistent (the signature is for downstream/external
verifiers, per A01's JWKS discussion) but worth stating plainly rather than assuming it implies
in-app integrity checking. The two `"*"`-pinned dependencies (A06) are also relevant here as a
supply-chain integrity concern. No CI/build step downloads and executes anything from an
unpinned source.

### A09 — Security Logging and Monitoring Failures ⚠️ Open

**Real progress this cycle**: the audit trail was restructured and materially expanded.
`AuditLog` (application-status-transition log) was renamed to `ApplicationLog` for consistency
with the equivalently-scoped `DataPermitLog`/`SpeProvisioningLog`. A new, separate `AuditLog` now
covers reference-data (masterdata) CRUD — 12 previously entirely unlogged ADMIN write actions
across data holders, SPE operators/providers, and data users — with entries recording *what*
changed (field names for routine edits, explicit outcome phrasing like "marked as trusted" for
the two access-control-relevant fields), not just that something did. Three new SPE-type CRUD
actions (create/update/delete) added this round follow the same logged-by-default pattern.

**The gap that remains, and it's a real one**: checked the design against NIST SP 800-53 AU-3's
six required audit-record content elements (event type, when, where, source, **outcome**,
identity) as part of the parallel NIST assessment — **only successful actions are logged**. A
rejected write (403 from a non-admin, a failed validation) leaves zero trace. This directly fails
this category's own core concern: you cannot detect a pattern of unauthorized access attempts if
none of them are ever recorded. It's also cheaper to fix than it might look — one log call added
to the shared `authz.ts` rejection path (`requireRole`/`findActingUser`/`requireRoleOrOwner`),
not one per route, and it doesn't depend on the A07 authentication gap being resolved first.

Also still open, unchanged from the prior review: several entity-scoped actions
(authorized-persons add/remove, appeal decisions, invoice issue/mark-paid/cancel,
trusted-data-holder changes) still have no audit trail — designed but not yet built (would need
its own table, kept separate from `ApplicationLog`/`DataPermitLog` so those stay pure
status-transition logs, not extended with fabricated non-transition entries).

**Remediation**: log failed-authorization outcomes in `authz.ts` (cheap, high value, no
dependencies); build the entity-scoped action log for the remaining 4 case-workflow actions.

### A10 — Server-Side Request Forgery ✅ Clean

Unchanged. `src/lib/ncp-client.ts` hardcodes `NCP_BASE_URL` as a module-level constant with a
fixed host and protocol; the only place request-derived input reaches an outbound URL, it lands
in the path only, never the host or protocol (not reportable per OWASP's own SSRF criteria). No
other outbound HTTP calls exist in the codebase — every other `fetch()` found is same-origin,
client-to-this-app's-own-API.

## Bottom line

Two full categories closed out this cycle (A01, A06), with A04/A07's shared root cause narrowed
to exactly its documented, accepted scope rather than an amplified one. A09 made real, verifiable
progress but surfaced a more precise remaining gap in the process (outcome logging) rather than
being fully closed. The single highest-leverage remaining item, spanning A04/A07/A05's SC-23
overlap, is still real authentication — everything else on this list is either already
independent of it (A05 headers, A06's remaining pinned deps, A09's outcome-logging gap) or
cascades from it once it exists.

### Suggested order

1. **Cheap, independent of auth**: log failed/rejected attempts in `authz.ts` (A09); add a
   `headers()` block (A05); pin the two `"*"` dependencies (A06/A08).
2. **The real fix**: session-based authentication (A04/A07), which also resolves the residual
   CSRF/forgeable-mutation exposure noted under NIST's SC-23.
3. **Round out A09**: the entity-scoped action log for authorized-persons/appeals/invoices/
   trusted-data-holder — designed, not yet built.
