# NIST security assessment: open-daams

_Snapshot date: 2026-07-09._

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

## Summary by control family

| # | Control(s) | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | IA-2, AC-3 | No authentication — RBAC trusts a client-supplied user id | Critical | Not met |
| 2 | SC-23, SC-5 | Unauthenticated state-changing endpoints; no CSRF token; no rate limiting | High | Not met |
| 3 | SI-11 | Raw `e.message` (incl. Prisma errors) returned to clients — 40 sites | Medium | Not met |
| 4 | SI-10 | No input-validation/schema layer at the API boundary | Medium | Partial |
| 5 | RA-5, SR-3 | 3 moderate dependency CVEs; 2 deps pinned to `"*"` | Medium | Not met |
| 6 | AU-9, AU-10 | Audit trail exists but actor is spoofable and rows are mutable at DB | Medium | Partial |
| 7 | SC-8, SC-18 | No security headers (CSP/HSTS/X-Frame-Options); TLS left to deployment | Medium | Not met |
| 8 | SC-28 | Health data unencrypted at rest (deployment; test-data-only today) | Low (now) | Partial |
| 9 | IA-5, SC-12 | Secrets in `.env` (gitignored); prior credential leak scrubbed from history | Low | Partial |

## Findings

### 1. IA-2 / AC-3 — No authentication (root issue)

`src/lib/authz.ts` `requireRole(userId, allowedRoles)` takes a `userId` straight from the
request body and looks it up — any client can act as any user, including `ADMIN`, by passing
that user's id. Aggravating factors:

- The identity field name is inconsistent across routes (`body.userId`, `actingUserId`,
  `checkedById`, `requestedById`, `issuedByUserId`).
- **Two core routes bypass the central helper entirely** —
  `src/app/api/applications/[id]/transition/route.ts` and `src/app/api/permits/[id]/route.ts`
  do their own inline `prisma.user.findUnique({ where: { id: body.userId } })` + role check.
  So the entire workflow (submit, decide, issue/revoke permits) is effectively
  unauthenticated.
- `src/middleware.ts` is next-intl locale routing only, and its matcher explicitly **excludes
  `/api`** — there is no auth boundary anywhere.

**Remediation.** Add real session-based authentication (e.g. Auth.js / OIDC) enforced in one
place. `authz.ts` already centralizes most checks, so the surface is contained — except the two
bypass routes, which should be routed through `requireRole` first. This is the single
highest-value fix; several findings below cascade from it.

### 2. SC-23 / SC-5 — Forgeable, unthrottled mutations

Because the JSON endpoints are unauthenticated and set no CSRF token, any origin can POST/PATCH
state changes; there is also no rate limiting, leaving them open to resource-exhaustion abuse.
Most of this dissolves once finding #1 is fixed with a real session + same-site cookies, but
rate limiting is a separate control.

### 3. SI-11 — Error message disclosure

40 handlers return `e instanceof Error ? e.message : …` to the client (e.g.
`src/app/api/applications/[id]/completeness-check/route.ts`). Prisma exceptions can leak
column/constraint names and query fragments. **Remediation:** log detail server-side; return a
generic message plus a correlation id.

### 4. SI-10 — Input validation

No `zod`/schema dependency; routes read `body.*` and hand it to Prisma.

- **Mitigant:** Prisma parameterizes queries (no SQL injection), and the create route
  (`src/app/api/applications/route.ts`) enumerates fields explicitly rather than spreading the
  body (limited mass-assignment).
- **Gap:** no type/length/enum/business-rule validation at the boundary — invalid input throws
  and then leaks via finding #3.

**Remediation.** Add a validation layer (e.g. zod) per route, rejecting malformed input with a
400 before it reaches the ORM.

### 5. RA-5 / SR-3 — Dependencies

`npm audit` reports **3 moderate** vulnerabilities:

- `next-intl` — open-redirect ([GHSA-8f24-v5vv-gm5j](https://github.com/advisories/GHSA-8f24-v5vv-gm5j))
  and prototype pollution ([GHSA-4c35-wcg5-mm9h](https://github.com/advisories/GHSA-4c35-wcg5-mm9h)).
- `postcss` — XSS via unescaped `</style>` in stringify output, pulled transitively through
  `next`.

Also `package.json` pins `@rijkshuisstijl-community/components-react` and
`@rijkshuisstijl-community/design-tokens` to `"*"` — non-reproducible builds and auto-pulling
any future (possibly malicious) publish (SR-3 / SSDF PW.4, PS.3).

**Remediation.** Pin the two `"*"` deps to real ranges; schedule `npm audit fix` (the next-intl
fix is a major version bump — test it). Add dependency scanning to CI (RV.1).

### 6. AU-9 / AU-10 — Audit integrity

**Good:** `AuditLog`, `DataPermitLog`, and `SpeProvisioningLog` capture actor + timestamp +
from/to state, and there is no API to mutate them (AU-2/AU-3 largely met).

**Gaps:** the recorded actor is the spoofable client id, so **non-repudiation (AU-10) is not
met** until authentication exists; and rows are ordinary DB records with no tamper-evidence
(AU-9) — `docs/architecture.md` itself flags WORM storage as a production requirement.

### 7. SC-8 / SC-18 — Missing hardening headers

`next.config.ts` sets no `headers()` block — no Content-Security-Policy, HSTS, X-Frame-Options,
or X-Content-Type-Options, and TLS is left entirely to the deployment platform. **Remediation:**
add a `headers()` block (cheap, high value against XSS/clickjacking) and enforce HTTPS/HSTS at
the platform.

### 8. SC-28 — Data at rest

Health data is modeled but unencrypted at rest; this is a deployment/infra control and only
test data exists today. Flag for production: database/disk encryption, and note that
pseudonymisation/anonymisation and the SPE are currently workflow stubs, not enforced data
handling.

### 9. IA-5 / SC-12 — Secrets

`.env` is correctly gitignored, and the earlier `postgres/postgres` default credential was
scrubbed from git history. Production needs a real secrets manager / KMS (also noted in
`architecture.md`).

## Bottom line

The architecture is sound for hardening — RBAC is (mostly) centralized, the ORM prevents
injection, and there is a real audit model. Nearly everything blocking a NIST-aligned posture
traces to **one missing capability: authentication**, which cascades into AC-3, SC-23, and
AU-10. Fixing that plus the header / error-handling / validation hygiene raises the posture
sharply. None of this is a surprise for a self-described demo; the code is honest about its
limitations.

### Suggested order

1. **Cheap wins (no architecture change):** security headers in `next.config.ts`; generic error
   responses (SI-11); pin the `"*"` dependencies (SR-3).
2. **Foundational:** real authentication (IA-2), routing the two bypass routes through
   `requireRole`, then layering CSRF + rate limiting on top (SC-23/SC-5).
3. **Boundary hardening:** per-route input validation (SI-10).
4. **Production controls:** audit-log immutability (AU-9), encryption at rest (SC-28), secrets
   management (IA-5) — deferred to a real deployment.
