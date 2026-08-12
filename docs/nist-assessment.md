# NIST security assessment: open-daams

_Snapshot date: 2026-08-12 (previous snapshot: 2026-08-07)._

This is a security assessment of the open-daams codebase mapped to **NIST SP 800-53r5**
control families, with **SSDF (SP 800-218)** noted for software-development-practice items.
Findings are grounded in the code as it exists at the time of writing; dependency data is from
`npm audit`.

> **Framing.** `docs/architecture.md` states the app runs on **test data only** with
> authentication explicitly stubbed. In its current *demo* posture the practical risk is low.
> This assessment is written against the bar the project would need to clear **before holding
> any real (special-category health) data or being publicly exposed** — which is the point of
> its EHDS/HDAB domain. Severities below assume eventual real-data use; every item is **Low**
> in the current test-only demo.
>
> This is an unofficial community project. Nothing here is a certification or compliance
> attestation.

## What changed since the 2026-08-07 snapshot

- **Financial data model unified**: `FeeEstimate`/`DataPermit`/`Invoice` now share one
  `FinancialLineItem` table instead of duplicated flat fee fields. Every touched route
  (`fee-estimate`, `permits`, `permits/[id]/invoices`, `provisional-invoice`,
  `change-requests/[requestId]`) retains its existing `requireRole` gate — no AC-3 regression.
- **Two new routes** (`spe-operators/[id]/types`, `spe-types/[id]`, ADMIN-only SPE-type CRUD)
  follow the already-hardened pattern from the prior round: `requireRole`, explicit input
  checks, and an `AuditLog` entry per write — extends AU-2/AU-3 masterdata coverage rather than
  adding a new gap.
- **SI-11 grew with the new/touched routes**: 53 handlers now return `e.message` to the client
  (was 48). Same existing issue, not a new class of finding. See finding #3.
- **SC-8/SC-18 (finding #7) resolved**: `src/proxy.ts` now generates a per-request nonce and sets
  a full security-header set (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy, Strict-Transport-Security) on every response. Verified live in both `next
  dev` and a production `next build`/`next start` that the CSP's nonce matches what Next attaches
  to its own hydration scripts. See finding #7.
- Nothing else regressed: SI-10 (input validation), SC-28 (data at rest), IA-5/SC-12 (secrets)
  are all unchanged from the prior snapshot.

## Summary by control family

| # | Control(s) | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | IA-2, AC-3 | No authentication (root issue); access enforcement on reads/ownership now real | Critical | Not met (AC-3 partial) |
| 2 | SC-23, SC-5 | Unauthenticated state-changing endpoints; no CSRF token; no rate limiting | High | Not met |
| 3 | SI-11 | Raw `e.message` (incl. Prisma errors) returned to clients — 53 sites | Medium | Not met |
| 4 | SI-10 | No input-validation/schema layer at the API boundary | Medium | Partial |
| 5 | RA-5, SR-3 | Dependency CVEs resolved; 2 deps still pinned to `"*"` | Medium → Low | Partial |
| 6 | AU-2, AU-3, AU-9, AU-10 | Audit coverage expanded; only successes logged; actor spoofable; rows mutable at DB | Medium | Partial |
| 7 | SC-8, SC-18 | Nonce-based CSP + full header set now set in `src/proxy.ts`; TLS itself still left to deployment | Low | Met |
| 8 | SC-28 | Health data unencrypted at rest (deployment; test-data-only today) | Low (now) | Partial |
| 9 | IA-5, SC-12 | Secrets in `.env` (gitignored); prior credential leak scrubbed from history | Low | Partial |

## Findings

### 1. IA-2 / AC-3 — No authentication (root issue); access enforcement improved

`src/lib/authz.ts` `requireRole(userId, allowedRoles)` / `findActingUser` / `requireRoleOrOwner`
take a `userId` straight from the request and look it up — any client can act as any user,
including `ADMIN`, by passing that user's id. **This root gap is unchanged**: there is still no
session, no token, no proof the caller actually is who they claim. `src/proxy.ts` (renamed from
`middleware.ts` in the Next 16 upgrade) is still next-intl locale routing only, and its matcher
still explicitly **excludes `/api`** — there is no auth boundary at the framework level.

**What did change**: a prior assessment round found several routes with **no identity check of
any kind**, not even the spoofable client-id one — full application detail (PII, notes, internal
audit log), raw attachment file bytes, decision-card PDFs, the internal permit record (status +
transition log), and `GET /api/users` (returning every user's id, name, email, and role with zero
auth). These are now fixed via a new `requireRoleOrOwner(userId, allowedRoles, ownerId)` helper —
staff role *or* the specific record's own applicant may read it, everyone else gets 401/403.
`/api/users` is now gated and trimmed to `id`/`name`/`role`. This is a genuine AC-3 (Access
Enforcement) improvement — it closes the gap between "no real authentication" and "no
authorization at all," which is a meaningfully worse combination than the former alone.
`GET /api/permits/[id]/pdf`, `/json`, and `/.well-known/jwks.json` were deliberately left
unauthenticated — D6.4 R9.1.3 requires a signed permit to be independently verifiable by third
parties with no DAAMS session, via the published JWKS key; gating those would contradict the
spec they implement.

**Remaining gaps**:
- The identity field name is still inconsistent across routes (`body.userId`, `actingUserId`,
  `checkedById`, `requestedById`, `issuedByUserId`).
- One of the two previously-cited central-helper bypass routes is now fixed —
  `applications/[id]/transition/route.ts` uses `findActingUser`. The other,
  `src/app/api/permits/[id]/route.ts` **POST** (the transition/revoke/expire action), still does
  its own inline `prisma.user.findUnique({ where: { id: body.actingUserId } })` rather than the
  shared helper (its sibling GET handler was fixed to use `requireRole` in the same round that
  fixed the read-side gaps above, but the POST was out of that round's scope).

**Remediation.** Add real session-based authentication (e.g. Auth.js / OIDC) enforced in one
place — this is still the single highest-value fix; SC-23 and AU-10 both cascade from it. Route
`permits/[id]/route.ts` POST through `requireRole` for consistency in the meantime.

### 2. SC-23 / SC-5 — Forgeable, unthrottled mutations

Unchanged. Because the JSON endpoints are unauthenticated and set no CSRF token, any origin can
POST/PATCH state changes; there is also no rate limiting, leaving them open to
resource-exhaustion abuse. Most of this dissolves once finding #1's root cause is fixed with a
real session + same-site cookies, but rate limiting is a separate control.

### 3. SI-11 — Error message disclosure

Unchanged in kind, grown in count: **53** handlers (was 48) return
`e instanceof Error ? e.message : …` to the client. Prisma exceptions can leak column/constraint
names and query fragments. **Remediation:** log detail server-side; return a generic message plus
a correlation id.

### 4. SI-10 — Input validation

Unchanged. No `zod`/schema dependency; routes read `body.*` and hand it to Prisma.

- **Mitigant:** Prisma parameterizes queries (no SQL injection), and create routes generally
  enumerate fields explicitly rather than spreading the body (limited mass-assignment) — this
  pattern was followed consistently in every route added this round too.
- **Gap:** no type/length/enum/business-rule validation at the boundary — invalid input throws
  and then leaks via finding #3.

**Remediation.** Add a validation layer (e.g. zod) per route, rejecting malformed input with a
400 before it reaches the ORM.

### 5. RA-5 / SR-3 — Dependencies

**Resolved**: `npm audit` now reports **0 vulnerabilities** (was 3 moderate — `next-intl`
open-redirect/prototype-pollution and a transitive `postcss` XSS). Closed via
`next` 15→16.3.0 and `next-intl` 3→4.13.5.

**Still open**: `package.json` still pins `@rijkshuisstijl-community/components-react` and
`@rijkshuisstijl-community/design-tokens` to `"*"` — non-reproducible builds and auto-pulling any
future (possibly malicious) publish (SR-3 / SSDF PW.4, PS.3). Severity downgraded from Medium to
Low now that the CVE portion is resolved — what remains is a supply-chain hygiene gap, not a
known vulnerability.

**Remediation.** Pin the two `"*"` deps to real ranges. Add dependency scanning to CI (RV.1).

### 6. AU-2 / AU-3 / AU-9 / AU-10 — Audit coverage expanded; integrity gaps remain

**Coverage improved**: the audit trail was restructured and expanded this round.
`AuditLog` (application-status-transition log) was renamed to `ApplicationLog` for consistency
with `DataPermitLog`/`SpeProvisioningLog` — each is bound to one entity's own status transitions.
A new, separate `AuditLog` was added for actions that aren't status transitions: reference-data
(masterdata) CRUD across data holders, SPE operators/providers, and data users — 12 previously
entirely unlogged ADMIN write actions. Entries now record *what changed*, not just that
something did (field names for routine edits; explicit outcome phrasing — "marked as trusted",
"SPE provider set to X" — for the two access-control-relevant fields). The three new SPE-type
CRUD actions (create/update/delete) added this round follow the same logged-by-default pattern.

**New, more specific gap identified this round**: checked the current design against NIST
AU-3's six required content elements (event type, when, where, source, **outcome**, identity).
**Only successful actions are logged** — a rejected write (403 from a non-admin, a validation
failure) leaves no record at all. AU-3's supplemental guidance explicitly calls out "success or
fail indications" as expected content, and D6.4 R15.4.6 separately requires security monitoring
to "detect suspicious activity, unauthorised access attempts" — neither is possible today, since
failed attempts simply vanish. This is a materially different (and cheaper to fix) gap than the
AU-9/AU-10 ones below: it doesn't need authentication first, just a log call in the
already-centralized `requireRole`/`findActingUser`/`requireRoleOrOwner` rejection path.

**Unchanged gaps**: the recorded actor is still the spoofable client id, so **non-repudiation
(AU-10) is still not met** until authentication exists (finding #1); and rows are still ordinary
mutable DB records with no tamper-evidence (AU-9) — `docs/architecture.md` itself flags WORM
storage as a production requirement. There is still no API that mutates a log row after creation
(AU-2/AU-3's "record it happened" is met for successes), but nothing at the database level
prevents one from being added later.

**Remediation.** Add a failure-path log call to the shared `authz.ts` helpers (cheap — one call
site, not one per route) to close the outcome gap. AU-9/AU-10 remain deferred to real
authentication + production storage controls (WORM/append-only enforcement at the DB level).

### 7. SC-8 / SC-18 — Security headers

**Resolved.** `src/proxy.ts` generates a fresh nonce per request and sets `Content-Security-Policy`
(`script-src`/`style-src` `'self' 'nonce-…' 'strict-dynamic'`, no `'unsafe-eval'`/`'unsafe-inline'`
in production — dev-only, for React's dev `eval` debugging and Turbopack Fast Refresh),
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
and `Strict-Transport-Security` on every response. A static `next.config.ts` `headers()` block
(the original suggestion below) can't generate a per-request nonce, so this landed in `proxy.ts`
instead — the only alternative would have been a nonce-less CSP falling back to `'unsafe-inline'`
for Next's own inline hydration scripts, which defeats most of the point. Chosen over that
simpler alternative because its usual cost — nonces require dynamic rendering — doesn't apply
here: every page under `src/app/[locale]` already reads `searchParams` or sets `force-dynamic`
(confirmed via `next build`: zero statically-optimized routes). Verified in both `next dev` and a
production `next build`/`next start` that the CSP nonce matches the `nonce=` attribute Next
attaches to its own hydration scripts/stylesheets.

**Still open:** TLS termination itself is a deployment concern, not an app-layer one —
`Strict-Transport-Security` is sent unconditionally but has no effect until HTTPS exists in front
of the app.

### 8. SC-28 — Data at rest

Unchanged. Health data is modeled but unencrypted at rest; this is a deployment/infra control and
only test data exists today. Flag for production: database/disk encryption, and note that
pseudonymisation/anonymisation and the SPE are currently workflow stubs, not enforced data
handling.

### 9. IA-5 / SC-12 — Secrets

Unchanged. `.env` is correctly gitignored, and the earlier `postgres/postgres` default credential
was scrubbed from git history. Production needs a real secrets manager / KMS (also noted in
`architecture.md`).

## Bottom line

The architecture is sound for hardening — RBAC is (mostly) centralized, the ORM prevents
injection, dependency hygiene is now clean, security headers are now real (nonce-based CSP, not
just a static allowlist), and the audit model grew real coverage this round. Nearly everything
still blocking a NIST-aligned posture traces to **one missing capability: authentication**, which
cascades into AC-3's remaining gap, SC-23, and AU-10. The one genuinely new, cheap finding this
round — audit logging only success outcomes — is worth fixing before the authentication work,
since it doesn't depend on it. None of this is a surprise for a self-described demo; the code is
honest about its limitations, and it's made real, verifiable progress since the last snapshot.

### Suggested order

1. **Cheap wins (no architecture change):** log failed/rejected attempts (AU-3 outcome, new
   this round); generic error responses (SI-11); pin the `"*"` dependencies (SR-3, only
   supply-chain hygiene left there now).
2. **Foundational:** real authentication (IA-2), routing the remaining bypass route
   (`permits/[id]/route.ts` POST) through `requireRole`, then layering CSRF + rate limiting on
   top (SC-23/SC-5).
3. **Boundary hardening:** per-route input validation (SI-10).
4. **Production controls:** audit-log immutability (AU-9), encryption at rest (SC-28), secrets
   management (IA-5) — deferred to a real deployment.
