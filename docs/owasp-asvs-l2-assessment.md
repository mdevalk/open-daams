# OWASP ASVS 5.0 (Level 2) assessment: open-daams

_Snapshot date: 2026-08-26, revised 2026-08-30 following the Keycloak/OIDC authentication
integration (V6/V7/V9/V10/V14.2.1 re-assessed; everything else unchanged from the original pass)._

This assesses the open-daams codebase against **OWASP Application Security Verification Standard
5.0**, Level 2 (L2 is cumulative — every Level 1 requirement plus the additional Level 2 set). ASVS
is a flat checklist of individually numbered, testable requirements across 17 chapters (V1–V17),
not a thematic top-10 list — this doc follows [`d6.4-requirements-traceability.md`](./d6.4-requirements-traceability.md)'s
flat-list format crossed with [`owasp-top10-assessment.md`](./owasp-top10-assessment.md)'s
narrative framing, rather than a shorter summarized pass. **253 Level 1/2 requirements** in total,
sourced directly from OWASP's authoritative repository (`github.com/OWASP/ASVS`, `5.0/en/0x1*-0x2*`
chapter files) rather than reconstructed from memory.

> **Framing.** Same as the other assessments: `docs/architecture.md` states the app runs on **test
> data only**. Authentication is now real (Keycloak/OIDC via Auth.js — see V6/V7/V9/V10 below), but
> scoped to a closed set of 5 seeded demo identities against a self-provisioned local realm, not a
> production identity provider (DigiD/eHerkenning remain the documented production requirement).
> This is written against the bar the project would need to clear before holding real (special-
> category health) data or being publicly exposed — not a certification or ASVS attestation.
>
> **Scope boundary — same three exclusions as `docs/nis2-assessment.md`/`docs/bio2-assessment.md`**:
> application code only. Datacenter/hosting/TLS-termination, the health data itself (never held by
> DAAMS — see `CLAUDE.md`'s scope note), and procedural/documentation-authoring activities are named
> and set aside rather than treated as code gaps. Where a requirement is purely "verify the
> documentation defines X" and no such document exists, that's recorded plainly (✗) rather than
> silently excluded — it's a real, cheap-to-fix gap distinct from the process/procedural exclusions.
>
> **Reuse, not re-derivation.** Large parts of ASVS overlap ground the existing five assessments
> already covered in depth (injection, crypto, CSP/headers, access control, logging, dependency
> hygiene). Those chapters cite and summarize the existing evidence rather than re-investigating
> from scratch; new investigation this pass concentrates on ground ASVS asks about that the others
> didn't: file handling, business-logic sequencing, mass assignment/prototype-pollution defenses,
> data-in-URL, and per-requirement granularity within already-touched areas.

## Summary

| Chapter | Status | Key finding |
|---|---|---|
| **V1 — Encoding and Sanitization** | ✅ Clean | Prisma-only DB access, no `eval`/raw SQL/XML parsing anywhere; most sub-items N/A (no LDAP/XPath/LaTeX/memcache/email in this codebase) |
| **V2 — Validation and Business Logic** | ◑ Partial | Workflow state-machine sequencing is genuinely well-built (`src/lib/workflow.ts`); no formal validation-rules documentation, no anti-automation/rate-limiting anywhere |
| **V3 — Web Frontend Security** | ✅ Clean | Full CSP/HSTS/frame-ancestors header set (A05); zero cookies exist in this app at all, so the entire Cookie Setup sub-chapter is N/A by architecture |
| **V4 — API and Web Service** | ✅ Clean | Consistent `NextResponse.json`/correct-Content-Type pattern; no GraphQL/WebSocket exists |
| **V5 — File Handling** | ⚠️ Open | No file-size limits, no extension/type allowlisting on the appeals-attachment upload route, no zip-bomb guard on the NCP nested-zip extraction |
| **V6 — Authentication** | ◑ Partial | Real OIDC login via Keycloak (Auth.js) replaces the former client-supplied `userId`; delegated concerns (password policy, MFA, recovery) aren't configured in the demo realm |
| **V7 — Session Management** | ◑ Partial | Real session now exists — an Auth.js JWT cookie, 8h `maxAge`, real sign-out (incl. Keycloak RP-initiated logout); no concurrent-session limits or anomaly detection |
| **V8 — Authorization** | ✅ Clean | `requireRole`/`requireRoleOrOwner` (`src/lib/authz.ts`) consistently applied, now fed a server-verified `userId`; see A01 |
| **V9 — Self-contained Tokens** | ◑ Partial | The Auth.js session cookie is a self-contained signed/encrypted JWT (`AUTH_SECRET`); local-dev secret is a placeholder value, not a rotated production secret |
| **V10 — OAuth and OIDC** | ◑ Partial | Implemented — Keycloak (OP) + Auth.js OIDC client (RP), PKCE in use; consent screens and step-up re-authentication aren't configured |
| **V11 — Cryptography** | ✅ Clean | Ed25519 permit signing (`@noble/ed25519`), SHA-512, no hardcoded secrets — see A02 |
| **V12 — Secure Communication** | ➖ Mostly out of scope | TLS termination is a deployment concern; HSTS is set unconditionally (A05) |
| **V13 — Configuration** | ◑ Partial | `.env`/local key file, not a secrets vault (documented gap, `architecture.md`); no debug-mode/directory-listing exposure found |
| **V14 — Data Protection** | ◑ Partial | `userId` no longer travels as the trust credential (session cookie does); ~8 vestigial `?userId=` query params remain in client code as dead, ignored values — cheap cleanup, no longer a security-relevant exposure; only 2 routes set `Cache-Control: no-store` |
| **V15 — Secure Coding and Architecture** | ✅ Clean | No mass-assignment pattern anywhere (6 routes use an explicit allowlist-builder helper); the one prototype-pollution-shaped bug found this session is already fixed |
| **V16 — Security Logging and Error Handling** | ✅ Clean | `AuditLog`/`AuthzFailureLog`/entity-scoped logs, generic error messages only — see A09 |
| **V17 — WebRTC** | ➖ N/A | No WebRTC anywhere in this codebase |

## Findings

### V1 — Encoding and Sanitization ✅ Clean

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 1.1.1 | 2 | Decode/unescape input into canonical form only once | ✅ | No manual decode/re-decode logic found anywhere; all parsing is `req.json()` once, or Prisma's own value handling |
| 1.1.2 | 2 | Output encoding as the final step, in the correct context | ✅ | React (JSX) auto-escapes on render by default; no `dangerouslySetInnerHTML` anywhere in `src/components`/`src/app` |
| 1.2.1 | 1 | Output encoding relevant to the response context | ✅ | Same — React handles HTML context; `NextResponse.json()` handles JSON context |
| 1.2.2 | 1 | URL-encode untrusted data when building URLs | ✅ | The one dynamically-built URL pattern (`mailto:`/`tel:` hrefs in `ContactsManager.tsx`) uses a fixed scheme prefix, not raw concatenation into an arbitrary scheme |
| 1.2.3 | 1 | Output encoding when dynamically building JS/JSON content | ✅ | `NextResponse.json()` (built-in `JSON.stringify`) throughout; no manual JS-string-building of response bodies |
| 1.2.4 | 1 | Parameterized queries/ORM, not raw SQL | ✅ | Cite A03 — zero `$queryRaw`/`$executeRaw`/string-concatenated SQL anywhere; 100% Prisma typed queries |
| 1.2.5 | 1 | Protect against OS command injection | ✅ | Cite A03 — no shell-exec calls in `src/` |
| 1.2.6 | 2 | LDAP injection protection | ➖ | N/A — no LDAP anywhere in this codebase |
| 1.2.7 | 2 | XPath injection protection | ➖ | N/A — no XPath/XML processing anywhere |
| 1.2.8 | 2 | LaTeX processor secure configuration | ➖ | N/A — no LaTeX processing |
| 1.2.9 | 2 | Escape special characters when building regular expressions from input | ✅ | No regex is built by interpolating untrusted input anywhere found (`slugify()` in `src/app/api/permits/route.ts` uses a fixed pattern, not user-supplied) |
| 1.3.1 | 1 | Sanitize untrusted HTML from WYSIWYG editors | ➖ | N/A — no rich-text/WYSIWYG input anywhere in the app |
| 1.3.2 | 1 | Avoid `eval()`/dynamic code execution | ✅ | Confirmed: zero `eval(`/`new Function(` matches anywhere in `src/` |
| 1.3.3 | 2 | Sanitize data passed to a dangerous context | ➖ | N/A — no such sink identified (no shell exec, no template engine, no `eval`) |
| 1.3.4 | 2 | Sanitize user-supplied SVG | ➖ | N/A — no SVG upload/rendering of untrusted SVG |
| 1.3.5 | 2 | Sanitize user-supplied scriptable template content (Markdown/CSS/etc.) | ➖ | N/A — no such feature exists |
| 1.3.6 | 2 | SSRF protection via allowlist | ✅ | Cite A10 — `src/lib/ncp-client.ts` hardcodes `NCP_BASE_URL` host+protocol; no other outbound HTTP calls exist |
| 1.3.7 | 2 | No templates built from untrusted input | ✅ | Cite A03 — PDF generation (`generate-permit-pdf.ts`) places text at fixed coordinates, no interpretable template layer |
| 1.3.8 | 2 | Sanitize input before JNDI queries | ➖ | N/A — not a Java application |
| 1.3.9 | 2 | Sanitize content sent to memcache | ➖ | N/A — no memcache in use |
| 1.3.10 | 2 | Sanitize format strings | ➖ | N/A — no C-style format-string functions in JS/TS |
| 1.3.11 | 2 | Sanitize input before use in mail systems (SMTP/IMAP) | ➖ | N/A — confirmed no email-sending code anywhere (same finding as `comply-or-explain-assessment.md`'s DKIM/DMARC N/A) |
| 1.4.1–1.4.3 | 2 | Memory-safe string/pointer handling, integer overflow, freed-memory hygiene | ➖ | N/A — TypeScript/Node.js is a memory-safe managed runtime; this sub-chapter targets unmanaged-code (C/C++/Rust-unsafe) codebases |
| 1.5.1 | 1 | Restrictive XML parser configuration (XXE) | ➖ | N/A — confirmed no XML parsing library anywhere in the codebase |
| 1.5.2 | 2 | Safe deserialization of untrusted data | ✅ | All request bodies are parsed via `req.json()` (safe `JSON.parse`, no polymorphic type resolution) and then explicitly field-by-field allowlisted before reaching Prisma — see V15.3.3 |

### V2 — Validation and Business Logic ◑ Partial

New investigation this pass — not covered elsewhere. The standout finding is genuinely positive:
`src/lib/workflow.ts`'s `TRANSITIONS` map + `getAvailableTransitions()` is a real, enforced state
machine — every status change is validated against an explicit allowed-transitions table keyed by
current status and role, so a case can't skip from `SUBMITTED` straight to `DECISION_ISSUED`, for
example. The gaps are the un-glamorous ones: no formal validation-rules documentation, and no
anti-automation/rate-limiting anywhere in the app (ties to the same root cause as A07 — without
real sessions, per-account rate limiting has nothing to key off).

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 2.1.1 | 1 | Documentation defines input-validation rules | ✗ | No dedicated validation-rules document exists |
| 2.1.2 | 2 | Documentation defines cross-field consistency rules | ✗ | Same gap |
| 2.1.3 | 2 | Documentation defines business-logic limits | ✗ | Same gap |
| 2.2.1 | 1 | Input validated against business/functional expectations | ◑ | Every API route checks required fields and enum-like values explicitly (e.g. `applicationType` in `src/lib/hdeu.ts`'s `parseHdeuPayload`), but there's no schema-validation library (zod/joi) — validation is hand-written per route, not systematic |
| 2.2.2 | 1 | Validation enforced at a trusted service layer, not just client-side | ✅ | Every route re-validates server-side regardless of what `NewApplicationForm.tsx` etc. do client-side; confirmed throughout this session's own added routes (`contacts`, `assessment-check`) |
| 2.2.3 | 2 | Combinations of related data items are validated for reasonableness | ◑ | Spot-checked examples exist (e.g. `CONTROL`/`RELATIVE` `relatesToIndex` resolution in `src/lib/hdeu.ts` only resolves against a real prior `COHORT` row), but not systematic across every multi-field form |
| 2.3.1 | 1 | Business logic flows only proceed in the expected sequential order | ✅ | `src/lib/workflow.ts`'s `TRANSITIONS`/`getAvailableTransitions()` — real enforced state machine, verified this session while reviewing the additional-info round-trip and permit-issuance gating logic |
| 2.3.2 | 2 | Business logic limits implemented per documentation | ✗ | No documented limits exist to implement against (see 2.1.3) |
| 2.3.3 | 2 | Business-logic-level transactions are all-or-nothing | ✅ | `prisma.$transaction([...])` used consistently for multi-write operations (completeness-check, assessment-check, permit issuance, this session's revert scripts) |
| 2.3.4 | 2 | Locking for limited-quantity resources | ➖ | N/A — no scarce-resource contention scenario exists in this domain (no seat/slot booking) |
| 2.4.1 | 2 | Anti-automation controls against excessive calls | ✗ | No rate limiting exists anywhere in the app — open gap, shares its root cause with A07 (no session to key a rate limit off) |

### V3 — Web Frontend Security ✅ Clean

`src/proxy.ts` (this Next.js version's `middleware.ts` equivalent) sets a full header set per A05.
The entire Cookie Setup sub-chapter (3.3.1–3.3.4) is **N/A by architecture**, not by omission:
confirmed zero occurrences of `document.cookie`/`Set-Cookie`/`cookies()` anywhere in `src/` — this
app has no cookies at all, including no locale cookie (routing is path-based, `/[locale]/...`).

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 3.2.1 | 1 | Browsers don't render responses in an incorrect context | ✅ | Cite A05 — `X-Content-Type-Options: nosniff` set on every response |
| 3.2.2 | 1 | Text-intended content uses safe rendering, not raw HTML | ✅ | React's default `textContent`-style rendering throughout; no `dangerouslySetInnerHTML` |
| 3.3.1–3.3.4 | 1/2 | Cookie `Secure`/`SameSite`/`__Host-`/`HttpOnly` attributes | ➖ | N/A — no cookies exist anywhere in this application |
| 3.4.1 | 1 | HSTS header on all responses | ✅ | Cite A05 — set unconditionally in `src/proxy.ts` |
| 3.4.2 | 1 | CORS `Access-Control-Allow-Origin` is a fixed value | ✅ | The one CORS-enabled route (`src/app/api/public/permits/[permitNumber]/status/route.ts`) sets a fixed `'*'` for a deliberately public, non-sensitive endpoint — not a reflected/dynamic origin |
| 3.4.3 | 2 | CSP header defines load-source directives | ✅ | Cite A05 — nonce-based CSP, no `unsafe-inline`/`unsafe-eval` in production |
| 3.4.4 | 2 | `X-Content-Type-Options: nosniff` on all responses | ✅ | Cite A05 |
| 3.4.5 | 2 | Referrer policy set | ✅ | Cite A05 — `strict-origin-when-cross-origin` |
| 3.4.6 | 2 | CSP `frame-ancestors` directive on every response | ✅ | Confirmed `frame-ancestors 'none'` in `src/proxy.ts:24`, alongside the legacy `X-Frame-Options: DENY` — both set, not just one |
| 3.5.1 | 1 | Protection against disallowed cross-origin requests to sensitive functionality | ✅ | No sensitive endpoint sets permissive CORS headers — only the one deliberately-public status route does, and it exposes no sensitive data |
| 3.5.2 | 1 | CORS preflight correctly gates sensitive functionality | ➖ | N/A — no sensitive functionality relies on or is exposed via CORS preflight |
| 3.5.3 | 1 | Sensitive functionality uses POST/PUT/PATCH/DELETE, not GET/HEAD | ✅ | Confirmed REST convention across every route read this session — all mutations are POST/PATCH/DELETE |
| 3.5.4 | 2 | Separate applications on separate hostnames | ➖ | N/A — single application |
| 3.5.5 | 2 | `postMessage` origin/syntax validation | ➖ | N/A — confirmed zero `postMessage`/`message` event-listener usage anywhere |
| 3.7.1 | 2 | Only supported, secure client-side technologies used | ✅ | Cite A06 — Next.js 16.3.0/React current, `npm audit` clean |
| 3.7.2 | 2 | Auto-redirects only to hosts the application controls | ➖ | N/A — no redirect-to-user-supplied-URL feature exists anywhere in the app (confirmed via search for `redirect(` call sites) |

### V4 — API and Web Service ✅ Clean

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 4.1.1 | 1 | Every response's `Content-Type` matches its actual content | ✅ | `NextResponse.json()` sets `application/json` automatically; `fileResponse()` (`src/lib/http.ts`) takes an explicit, correct `mimeType` per call site (PDF, attachment content-type, etc.) |
| 4.1.2 | 2 | Only user-facing endpoints auto-redirect HTTP→HTTPS | ➖ | Out of scope — TLS termination/redirect is a deployment/hosting concern, same boundary as `nis2-assessment.md` |
| 4.1.3 | 2 | Intermediary-set headers (e.g. `X-Forwarded-For`) only trusted from a real intermediary | ➖ | N/A — confirmed zero `X-Forwarded-*` header reads anywhere in the app; nothing trusts a spoofable header because nothing reads one |
| 4.2.1 | 2 | Consistent HTTP message boundary parsing across all components | ➖ | Out of scope — load-balancer/reverse-proxy configuration, not application code |
| 4.3.1–4.3.2 | 2 | GraphQL query-cost limiting, introspection disabled in prod | ➖ | N/A — no GraphQL anywhere in this codebase |
| 4.4.1–4.4.4 | 1/2 | WebSocket-over-TLS, origin checking, dedicated session tokens | ➖ | N/A — no WebSocket usage anywhere; this is a standard Next.js request/response application |

### V5 — File Handling ⚠️ Open

New investigation this pass — the one chapter with genuine, concrete open gaps. Two real file-handling
surfaces exist: `POST /api/appeals/[id]/attachments` (base64 upload of correspondence/court rulings)
and `mapNcpDetailZipToHdeuPayload`/`resolveAttachmentBytes` in `src/lib/ncp-client.ts` (extracts
attachment bytes from a ZIP archive delivered by the HD@EU NCP integration — including a **nested
zip-within-a-zip** case at `ncp-client.ts:221`).

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 5.1.1 | 2 | Documentation defines permitted file types/extensions/max size | ✗ | No such documentation exists |
| 5.2.1 | 1 | Application only accepts files of a processable size | ✗ | Confirmed: neither the appeals-attachment route nor the NCP zip-extraction path enforces any size cap. `Attachment.sizeBytes` is recorded, never validated against a limit |
| 5.2.2 | 1 | File extension checked against declared content-type; both restricted to an allowlist | ✗ | The appeals-attachment route (`src/app/api/appeals/[id]/attachments/route.ts`) accepts any client-supplied `filename`/`mimeType` with no allowlist check at all |
| 5.2.3 | 2 | Compressed-file bomb protection (max uncompressed size / compression ratio) | ✗ | `AdmZip` extraction in `ncp-client.ts` has no size/ratio guard before decompressing — includes a nested-zip case, which compounds the risk. Narrower trust boundary than a public upload (this is the NCP integration path, not an anonymous internet upload), but still a real gap against this requirement's letter |
| 5.3.1 | 1 | Uploaded/generated files aren't executed as server-side code | ✅ | `Attachment.content` is stored as DB `Bytes`, never written to a served static/public directory or executed — architecturally not possible for this app to run an uploaded file |
| 5.3.2 | 1 | File paths for operations use internally-generated names, not user-submitted ones | ✅ | `GET /api/attachments/[id]` fetches by the Prisma-generated `id` (cuid); the user-supplied `filename` is used only for the `Content-Disposition` header, never for lookup — no path-traversal surface |
| 5.4.1 | 2 | User-submitted filenames validated/ignored, safe default used | ◑ | Filename isn't validated but is only ever used as a response header value, never as a filesystem/lookup path (see 5.3.2) — the risk this requirement targets (path traversal) doesn't apply here, though the letter of "validated or ignored" isn't met |
| 5.4.2 | 2 | Served filenames are encoded/sanitized (RFC 6266) | ◑ | `fileResponse()` (`src/lib/http.ts:14`) escapes backslash/quote characters to prevent header injection/break-out, but doesn't implement full RFC 6266 `filename*=` encoding for non-ASCII names |
| 5.4.3 | 2 | Files from untrusted sources are antivirus-scanned | ✗ | No AV scanning exists anywhere in the pipeline |

### V6 — Authentication ◑ Partial

Real authentication now exists: Keycloak (a dedicated OIDC identity provider, containerized in
`docker-compose.yml`, self-provisioned via `keycloak/realm-export.json`) issues the actual login;
Auth.js (`src/auth.ts`) is the OIDC client. `findActingUser`/`requireRole`/`requireRoleOrOwner`
(`src/lib/authz.ts`, unchanged) now receive a server-verified `userId` — resolved from the session
via `actingUserId()` — instead of a client-supplied one. This resolves the root gap previously
cross-referenced as `owasp-top10-assessment.md` A07, `nis2-assessment.md` (i)/(j), and
`bio2-assessment.md` 5.15–5.18 (those docs are updated to match, not re-derived here). What
remains: most of this chapter's requirements concern factors and lifecycle stages (password
policy, MFA, recovery) that are Keycloak's responsibility as the IdP, and the demo realm doesn't
configure any of them.

| ID range | Level | Chapter section | Status | Note |
|---|:---:|---|:---:|---|
| 6.1.1–6.1.3 | 1/2 | Authentication Documentation | ◑ | Described in `docs/architecture.md`, `CLAUDE.md`, and this doc's own framing note; no standalone authentication-design document |
| 6.2.1–6.2.12 | 1/2 | Password Security | ➖ | N/A for open-daams's own code — password handling is entirely Keycloak's (the IdP). The demo realm itself sets no password policy and all 5 seeded users share one password (`Demo1234!`) — a deliberate, documented demo simplification, not a production posture |
| 6.3.1–6.3.4 | 1/2 | General Authentication Security | ✅ | `signIn` callback (`src/auth.ts`) rejects any Keycloak identity without a matching Postgres `User` row — closed-world, fails closed; `requireRole` unchanged and still fails closed on an unresolvable id |
| 6.4.1–6.4.4 | 1/2 | Auth Factor Lifecycle and Recovery | ➖ | N/A/delegated — Keycloak owns this; not configured in the demo realm (no email server wired up for password reset) |
| 6.5.1–6.5.5 | 2 | General MFA Requirements | ➖ | Delegated to Keycloak, which supports OTP/WebAuthn — not enabled in the demo realm |
| 6.6.1–6.6.3 | 2 | Out-of-Band Authentication | ➖ | N/A — not configured |
| 6.8.1–6.8.4 | 2 | Authentication with an Identity Provider | ✅ | This is exactly what was built — see V10 for the OIDC-specific requirements |

### V7 — Session Management ◑ Partial

A real session now exists: Auth.js issues a signed/encrypted JWT session cookie on successful
login (`session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }` in `src/auth.ts`), verified on every
request via `auth()`/`getToken()` — not a forgeable client-supplied value. Sign-out
(`src/app/api/auth/keycloak-signout/route.ts`) clears the local cookie *and* performs Keycloak's
RP-initiated logout (`id_token_hint`/`post_logout_redirect_uri`), closing the SSO session too —
Auth.js's own `signOut()` alone only does the former.

| ID range | Level | Chapter section | Status | Note |
|---|:---:|---|:---:|---|
| 7.1.1–7.1.3 | 2 | Session Management Documentation | ◑ | Described in `docs/architecture.md`/`CLAUDE.md`; no standalone document |
| 7.2.1–7.2.4 | 1 | Fundamental Session Management Security | ✅ | Session token is a signed/encrypted JWT (delegated to Auth.js's implementation), issued fresh on each Keycloak login, carried in an `HttpOnly`/`SameSite=Lax` cookie |
| 7.3.1–7.3.2 | 2 | Session Timeout | ✅ | Explicit 8-hour `maxAge`; no idle-timeout distinct from absolute timeout |
| 7.4.1–7.4.5 | 1/2 | Session Termination | ✅ | Real sign-out clears the local session *and* ends the Keycloak SSO session (RP-initiated logout) — verified end-to-end (session is `null` after, a protected page redirects to sign-in again) |
| 7.5.1–7.5.2 | 2 | Defenses Against Session Abuse | ➖ | No concurrent-session limits, no device/IP-change anomaly detection |
| 7.6.1–7.6.2 | 2 | Federated Re-authentication | ➖ | No step-up re-authentication for sensitive actions (e.g. permit revocation) — a normal 8h-old session is sufficient for everything |

### V8 — Authorization ✅ Clean

The one chapter of the auth-adjacent group that already had real, working controls before the
Keycloak integration — role-based authorization was always layered independently, and now sits on
top of a real, session-verified `userId` rather than a client-supplied one. Cite A01 in full:
`requireRole`/`requireRoleOrOwner` (`src/lib/authz.ts`) are applied consistently across every route
sampled this session, including the newest ones (`contacts`, `assessment-check`).

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 8.1.1 | 1 | Documentation defines function/data-level authorization rules | ◑ | No standalone document, but the rules themselves are explicit and centralized in `src/lib/authz.ts` and each route's own doc comment (e.g. `requireRole(actingUserId, ['ADMIN'])`) — self-documenting in code, not in a separate artifact |
| 8.1.2 | 2 | Documentation defines field-level access rules | ✗ | No field-level read/write restriction concept exists in this app at all — every authorized role sees full records |
| 8.2.1 | 1 | Function-level access restricted to explicit permissions | ✅ | Cite A01 — confirmed across every masterdata/case-workflow route |
| 8.2.2 | 1 | Data-specific (IDOR/BOLA) access restricted to explicit permissions | ✅ | Cite A01 — `requireRoleOrOwner` gates applicant-owned records (applications, attachments) to the owner or staff roles |
| 8.2.3 | 2 | Field-level access restricted to explicit permissions | ✗ | Same gap as 8.1.2 — no field-level authorization exists (e.g. any `CASE_HANDLER` sees every field of any application) |
| 8.3.1 | 1 | Authorization enforced at a trusted service layer, not client-controllable | ✅ | Every check happens server-side in the API route; the `isAdmin`/role checks in client components (`MasterdataManager.tsx` etc.) are UX-only and re-checked server-side |
| 8.4.1 | 2 | Multi-tenant cross-tenant isolation | ➖ | N/A — open-daams is single-tenant (one HDAB instance); no multi-tenant data model exists |

### V9 — Self-contained Tokens ◑ Partial

The Auth.js session cookie is itself a self-contained signed/encrypted JWT — this chapter is now
applicable where it was previously N/A. Implementation is delegated to Auth.js's own library code
(`jose` under the hood), not hand-rolled.

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 9.1.1–9.1.3 | 1 | Signature/MAC validation, algorithm allowlist, trusted key source | ◑ | Delegated to Auth.js (`AUTH_SECRET`-derived key, fixed algorithm, no `alg: none` acceptance) — not independently re-verified line-by-line against the library's source. The `.env`/local-dev `AUTH_SECRET` is a placeholder value, not a rotated production secret (same posture as the permit-signing key, `13.1.1`/`bio2-assessment.md`). (The separate Ed25519-signed digital permit, `src/lib/permit-signing.ts`, is a *document* signature for external verification, not an auth token — already assessed under A02/A08, distinct concern) |
| 9.2.1–9.2.4 | 1/2 | Token validity window, type/purpose check, audience restriction | ◑ | Validity window = the 8h `maxAge` (V7.3); audience restriction is N/A in the applicable sense — this is a first-party session cookie scoped to one app, never passed to a third-party resource server as a bearer token |

### V10 — OAuth and OIDC ◑ Partial

Implemented. Keycloak is the OpenID Provider; Auth.js (`src/auth.ts`, `next-auth/providers/keycloak`)
is the OIDC client (Relying Party) — this was the concrete, named remediation for V6/V7's former
root gap, already stated as such in `owasp-top10-assessment.md` A07 and
`comply-or-explain-assessment.md`'s federated-identity cross-reference (both updated to match).
Verified directly (not just configured): the authorization request includes
`code_challenge`/`code_challenge_method=S256` (PKCE), the client is confidential
(`publicClient: false`, `directAccessGrantsEnabled: false`), and the full code-exchange round trip
was driven end-to-end via curl and a real browser.

| ID range | Level | Chapter section | Status | Note |
|---|:---:|---|:---:|---|
| 10.1.1–10.1.2 | 2 | Generic OAuth/OIDC Security | ✅ | PKCE (`S256`) confirmed in the live authorization request; state/nonce handling is Auth.js's own implementation |
| 10.2.1–10.2.2 | 2 | OAuth Client | ✅ | `daams-app` client: confidential, `standardFlowEnabled` only, exact-match `redirectUris` (no wildcard) |
| 10.3.1–10.3.4 | 2 | OAuth Resource Server | ➖ | N/A — open-daams doesn't accept bearer tokens from third parties; it's the OIDC client only, not a resource server |
| 10.4.1–10.4.11 | 1/2 | OAuth Authorization Server | ➖ | N/A — Keycloak is the authorization server; open-daams's own code doesn't implement one |
| 10.5.1–10.5.5 | 2 | OIDC Client | ✅ | ID token consumed via Auth.js's standard OIDC flow; `signIn` callback additionally requires the email claim to match an existing seeded `User` row before accepting the login |
| 10.6.1–10.6.2 | 2 | OpenID Provider | ➖ | N/A — Keycloak is the OP; open-daams's own code doesn't implement one |
| 10.7.1–10.7.3 | 2 | Consent Management | ➖ | No consent screen shown — the client is first-party/confidential and the realm doesn't require consent for it, appropriate for this closed demo-user setup but worth revisiting if the client set ever grows beyond one first-party app |

### V11 — Cryptography ✅ Clean

Cite A02 in full for the concrete implementation (Ed25519 via `@noble/ed25519`, SHA-512, correct
canonicalization). ASVS's more granular items below are new to this pass but confirm the same
picture.

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 11.1.1–11.1.2 | 2 | Documented key-management policy, cryptographic inventory | ✗ | No standalone documentation exists — the one cryptographic use (permit signing) is code-documented in `src/lib/permit-signing.ts` but not in a maintained inventory artifact |
| 11.2.1 | 2 | Industry-validated crypto implementations | ✅ | `@noble/ed25519` — modern, audited pure-JS implementation (cite A02) |
| 11.2.2 | 2 | Crypto agility (swappable algorithms/key sizes) | ◑ | The signing algorithm (Ed25519) is hardcoded, not configurable — reasonable for a single, fixed-purpose use case, but not "agile" by this requirement's letter |
| 11.2.3 | 2 | All primitives use ≥128-bit security | ✅ | Ed25519 (~128-bit security level) + SHA-512 both meet this |
| 11.3.1–11.3.2 | 1 | No insecure block modes/padding; only approved ciphers | ➖ | N/A — no symmetric encryption is used anywhere in this codebase (no data-at-rest application-layer encryption; DB-level encryption, if any, is a hosting/deployment concern) |
| 11.3.3 | 2 | Encrypted data protected against modification | ➖ | N/A — same reason, no encryption to protect |
| 11.4.1 | 1 | Only approved hash functions | ✅ | SHA-512, used correctly in the signing pipeline |
| 11.4.2 | 2 | Passwords stored via a computationally-intensive KDF | ➖ | N/A — no passwords are stored (see V6) |
| 11.4.3 | 2 | Collision-resistant hash functions for signatures/integrity | ✅ | SHA-512 |
| 11.4.4 | 2 | Approved KDF with stretching for password-derived keys | ➖ | N/A — no password-derived keys |
| 11.5.1 | 2 | CSPRNG for non-guessable random values | ◑ | The permit-signing key generation and `generateSampleDid()` use proper randomness where cryptographically relevant; however several reference/sample identifiers elsewhere (e.g. sample DIDs, per `src/lib/did.ts`'s own naming) are explicitly non-cryptographic placeholders by design — correctly scoped, but worth noting this chapter's requirement doesn't universally apply to every random-looking value in this codebase |
| 11.6.1 | 2 | Approved algorithms/modes for key generation and digital signatures | ✅ | Ed25519 is an approved, modern signature algorithm |

### V12 — Secure Communication ➖ Mostly out of scope

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 12.1.1–12.1.3 | 1/2 | TLS version/cipher-suite/mTLS configuration | ➖ | Out of scope — TLS termination happens at the hosting/reverse-proxy layer, not in application code, same boundary as every other assessment in this repo |
| 12.2.1 | 1 | TLS used for all external client connectivity, no fallback | ✅ | HSTS is set unconditionally in `src/proxy.ts` (cite A05) — the application-layer half of this requirement (instructing the browser to never fall back to plain HTTP) is met; actual certificate/TLS-version enforcement is the hosting layer's job |
| 12.2.2 | 1 | Publicly trusted TLS certificates | ➖ | Out of scope — hosting concern |
| 12.3.1–12.3.4 | 2 | Service-to-service TLS, certificate validation | ➖ | Out of scope for the one outbound integration (NCP client) at the hosting/network layer; the application code itself hardcodes `https://` in `NCP_BASE_URL` (cite A10), which is the code-layer half of this requirement |

### V13 — Configuration ◑ Partial

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 13.1.1 | 2 | All communication needs documented | ✗ | No standalone document; the one external dependency (NCP) is documented in code comments, not a maintained artifact |
| 13.2.1–13.2.2 | 2 | Backend inter-component communication secured | ➖ | N/A/out of scope — single-process Next.js app talking to Postgres via Prisma over a local/private connection string; no separate backend-service mesh exists |
| 13.2.3 | 2 | No default credentials for service auth | ✅ | `.env.example` ships an obviously-placeholder `changeme` value, not a working default (cite A05) |
| 13.2.4–13.2.5 | 2 | Allowlist of external systems the app may contact | ✅ | Cite A10 — `NCP_BASE_URL` is the only outbound integration, hardcoded, not configurable at runtime by any input |
| 13.3.1–13.3.2 | 2 | Secrets management via a vault, least-privilege access | ✗ | Documented, known gap — `architecture.md`'s "Key management" row: `.env` file / local key file, not an HSM/KMS. Real gap for a production posture, already tracked as a stated limitation, not silently missing |
| 13.4.1 | 1 | No source-control metadata (`.git`) exposed | ➖ | Out of scope — deployment/hosting concern (web-server document-root configuration), not application code |
| 13.4.2 | 2 | Debug modes disabled in production | ✅ | `next.config.ts` sets no debug flags; Next.js's own production build strips dev-mode features (confirmed via A05's earlier `next build`/`next start` verification finding zero `unsafe-eval` in the production CSP) |
| 13.4.3 | 2 | No directory listing exposed | ➖ | Out of scope — web-server/hosting configuration |
| 13.4.4 | 2 | HTTP TRACE method not supported in production | ➖ | Out of scope — Next.js's built-in server doesn't implement TRACE; this is effectively inherited-clean, not app-code-enforced |
| 13.4.5 | 2 | Internal API docs/monitoring endpoints not exposed unintentionally | ✅ | No OpenAPI/Swagger endpoint or monitoring dashboard route exists in `src/app/api` at all (ties to `comply-or-explain-assessment.md`'s separate finding that no OpenAPI spec exists yet — nothing to accidentally expose) |

### V14 — Data Protection ◑ Partial

Previously: **`userId` — this application's entire trust credential, standing in for a session
token — travelled as a URL query-string parameter in roughly 10 places.** That's now resolved —
every API route reads the acting user from the verified session (`actingUserId()`), not the URL —
but ~8 of those `?userId=...` query params are still physically present in client-side code
(`DecisionCardPanel.tsx`, `AppealsPanel.tsx`, `NcpFetchForm.tsx`, `HdeuImportForm.tsx`,
`applications/[id]/page.tsx`) as dead, ignored values the server no longer reads. They no longer
function as a trust credential — the V14.2.1 exposure this row targets (browser history, access
logs, `Referer` headers carrying something *sensitive*) is resolved — but removing the leftover
literal strings is still worth doing as cleanup.

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 14.1.1–14.1.2 | 2 | Sensitive-data classification and protection-level documentation | ✗ | No such documentation exists — `CLAUDE.md`'s scope note (DAAMS never holds the health data itself) narrows what *would* need classifying, but the classification exercise itself hasn't been done |
| 14.2.1 | 1 | Sensitive data only in body/headers, never URL/query string | ◑ | Resolved as a security control (the session cookie, not the URL, carries trust) — see above. ~8 vestigial `?userId=` query params remain as dead client-side code, not yet cleaned up |
| 14.2.2 | 2 | Sensitive data not cached in server components (load balancers, caches) | ◑ | Only 2 routes set explicit `Cache-Control` (the public permit-status endpoint's `no-store`, and one other); most routes serving application/permit detail data set no caching header at all, relying on Next.js's own per-request dynamic rendering (`export const dynamic = 'force-dynamic'` on every page) rather than an explicit no-store directive |
| 14.2.3 | 2 | Sensitive data not sent to untrusted third parties (trackers) | ✅ | No analytics/tracking scripts found anywhere in `src/app` |
| 14.2.4 | 2 | Controls around sensitive-data encryption/retention/logging/access are consistent with its classification | ◑ | Retention is tracked for permits (`architecture.md`'s compliance table, `bio2-assessment.md` 5.33/8.10 finding on the enforcement gap); no unified data-classification policy to check every category against (see 14.1.1) |
| 14.3.1 | 1 | Authenticated data cleared from client storage on session end | ➖ | N/A — confirmed zero `localStorage`/`sessionStorage` usage anywhere in the app; no client-side data persistence exists to clear |
| 14.3.2 | 2 | Anti-caching headers on sensitive responses | ◑ | Same finding as 14.2.2 |
| 14.3.3 | 2 | No sensitive data in browser storage | ✅ | N/A/clean by the same absence confirmed in 14.3.1 |

### V15 — Secure Coding and Architecture ✅ Clean

The standout finding: **no mass-assignment pattern exists anywhere in this codebase.** Every
mutating API route builds its Prisma `data:` object via an explicit, field-by-field allowlist
helper (`build<X>UpdateData()` — 6 such functions found across `data-holders`, `data-users`,
`spe-operators`, `spe-providers`, `spe-types`, and `contacts`; `src/lib/hdeu.ts`'s
`buildApplicationCreateData()` follows the identical pattern for the one create-path exception),
never a raw `{ ...body }` spread. This
is also the chapter covering prototype pollution (15.3.6): the one place a plain-object-as-allowlist
pattern existed with an attacker-suppliable key (`OWNER_FIELD[ownerType]` in the `contacts` routes)
was found and fixed as a real bug **during this same session**, before this assessment was written
— see the commit hardening it with `Object.hasOwn()`.

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 15.1.1–15.1.3 | 1/2 | Documented remediation timeframes, SBOM, resource-intensive-functionality docs | ✗ | No SBOM or remediation-timeframe policy document exists; `npm audit` (cite A06) is the closest existing practice, run ad hoc + in CI, not against a documented SLA |
| 15.2.1 | 1 | No components past their remediation deadline | ◑ | No deadline policy exists to measure against (see 15.1.1), but `npm audit` reports 0 vulnerabilities currently (cite A06) |
| 15.2.2 | 2 | Defenses against availability loss from expensive functionality | ➖ | Not assessed — no resource-intensive functionality (batch processing, heavy computation) exists in this app to need defending |
| 15.2.3 | 2 | Production only includes required functionality | ✅ | No debug/admin-only routes found exposed without the standard `requireRole` gate; no unused example/scaffold routes found in `src/app/api` |
| 15.3.1 | 1 | Only the required subset of fields returned, not entire objects | ◑ | Most routes use Prisma `select`/`include` scoping (e.g. `select: { name: true }` patterns seen throughout this session's own new routes), but some `findUnique`/`findMany` calls return full model objects to already-authorized staff roles without field-level trimming — consistent with the 8.1.2/8.2.3 field-level-authorization gap, not a new finding |
| 15.3.2 | 2 | Backend doesn't follow redirects from external URLs unless intended | ➖ | N/A — the one outbound call (NCP client) doesn't follow arbitrary redirects; `NCP_BASE_URL` is fixed, and the client makes a direct request to a hardcoded host |
| 15.3.3 | 2 | Defenses against mass assignment | ✅ | Confirmed above — no `{ ...body }`-into-Prisma pattern found anywhere; every route uses an explicit field allowlist |
| 15.3.4 | 2 | Original client IP transferred via trusted, non-spoofable fields | ➖ | N/A — confirmed no `X-Forwarded-For`/similar header is read anywhere (see 4.1.3); this also means client IP currently isn't captured for logging at all, a distinct, already-noted limitation in A09 ("doesn't capture which route was hit", similarly no IP) |
| 15.3.5 | 2 | Strict type/equality checks | ✅ | TypeScript's `===`/strict typing is used throughout; no loose `==` comparisons found in the security-relevant paths sampled this session |
| 15.3.6 | 2 | Prevent prototype pollution (e.g. use `Set()`/`Map()` over object literals for untrusted-keyed data) | ✅ | The one instance of this exact anti-pattern (`OWNER_FIELD[ownerType]` with an attacker-suppliable key) was found and fixed this session, with a regression test locking in the `Object.hasOwn()` guard |
| 15.3.7 | 2 | Defenses against HTTP parameter pollution | ➖ | Not directly assessed — Next.js's `URLSearchParams`-based query parsing (`.get()`) always returns the first value for a duplicated param, which is the safe default; no custom query-string parsing exists that would resolve differently |

### V16 — Security Logging and Error Handling ✅ Clean

Cite A09 in full: `AuditLog` (masterdata + case-workflow actions), `AuthzFailureLog` (rejected
attempts), and the pure-status-transition logs (`ApplicationLog`/`DataPermitLog`/
`SpeProvisioningLog`) together mean every mutation path leaves a trace, success or failure. Error
handling returns only `.message`, never a stack trace, confirmed across every route read this
session.

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 16.1.1 | 2 | Documented logging inventory | ✗ | No standalone document exists; the taxonomy is established and consistent in code/comments (per-file doc comments explaining the `ApplicationLog`/`AuditLog` split) but not in a maintained inventory artifact |
| 16.2.1 | 2 | Log entries include when/where/who/what metadata | ◑ | `userId`, `entityType`, `entityId`, `action`, `createdAt` are always present; "where" (originating route/IP) is the one gap already noted in A09 |
| 16.2.2 | 2 | Synchronized UTC timestamps | ✅ | Prisma `DateTime @default(now())` — Postgres/Node both operate in UTC internally regardless of display locale |
| 16.2.3 | 2 | Logs only go to documented destinations | ✅ | All logging is to the same Postgres database via Prisma — no secondary log sink exists to have drifted out of sync with documentation |
| 16.2.4 | 2 | Logs readable/correlatable in a common format | ✅ | Uniform relational schema (`AuditLog`/`AuthzFailureLog`/etc. all share the same `userId`/`entityType`/`entityId`/`action`/`comment`/`createdAt` shape) |
| 16.2.5 | 2 | Logging respects the data's protection level | ◑ | No PII/health-data content is logged (confirmed no request bodies are dumped into log rows anywhere), but this is by convention, not enforced against a documented classification (see 14.1.1) |
| 16.3.1 | 2 | All authentication operations logged | ➖ | N/A — no authentication operations exist to log (see V6) |
| 16.3.2 | 2 | Failed authorization attempts logged | ✅ | Cite A09 — `AuthzFailureLog`, verified live this session's predecessor assessment |
| 16.3.3 | 2 | Documented security events logged, including bypass attempts | ◑ | No formal security-event documentation exists (see 16.1.1), but the actual set of logged events is broad and was verified live |
| 16.3.4 | 2 | Unexpected errors and security-control failures logged | ◑ | Every route's `catch` block does `console.error(...)` server-side, but this isn't persisted to a queryable log table the way `AuditLog`/`AuthzFailureLog` are — an unhandled exception is visible in server logs, not in the app's own audit trail |
| 16.4.1 | 2 | Log injection prevented via encoding | ✅ | All log writes go through Prisma's parameterized inserts, not string-concatenated log lines — no log-injection vector exists |
| 16.4.2 | 2 | Logs protected from unauthorized access/modification | ◑ | Logs live in the same Postgres database as application data, readable via the app's own staff-role-gated pages (`/audit-log`, `/security-log`); no separate, more-restricted access tier exists between "any staff role" and "the log data" |
| 16.4.3 | 2 | Logs securely transmitted to a separate analysis system | ✗ | No SIEM/separate log-analysis system exists — logs stay in the primary application database |
| 16.5.1 | 2 | Generic error message to the consumer on unexpected/sensitive errors | ✅ | Cite A05/A09 — every route returns only `.message`, never a raw error object or stack trace |
| 16.5.2 | 2 | Application continues operating securely when external resources fail (circuit breaker etc.) | ◑ | The one external dependency (NCP client) has retry/error-handling logic, but no circuit-breaker pattern; a sustained NCP outage would surface as repeated failed requests, not a fast-failing open circuit — low-impact given NCP calls are user-triggered imports, not a hot path |
| 16.5.3 | 2 | Fails gracefully and securely, no fail-open conditions | ✅ | `requireRole`/`requireRoleOrOwner` fail closed on any error (missing/invalid user → 401/403, never a silent privileged default) — confirmed in A07 |

### V17 — WebRTC ➖ N/A

| ID | Level | Requirement | Status | Note |
|---|:---:|---|:---:|---|
| 17.1.1 | 2 | TURN server IP allowlisting | ➖ | N/A — no WebRTC/TURN/media server exists anywhere in this codebase |
| 17.2.1–17.2.4 | 2 | DTLS/SRTP media security | ➖ | N/A — same reason |
| 17.3.1–17.3.2 | 2 | Signaling-server resilience | ➖ | N/A — same reason |

## Bottom line

open-daams's actual security posture, read through ASVS's finer-grained lens, has changed since the
original pass: the dominant, single highest-leverage gap every assessment named is now closed.

- **The root authentication gap is resolved** (V6/V7/V9/V10) — real OIDC login via Keycloak, a real
  session (Auth.js JWT, 8h `maxAge`, real sign-out including Keycloak's own SSO), and
  `authz.ts`/RBAC now fed a server-verified identity instead of a client-supplied one. What remains
  in these chapters is delegated-to-Keycloak configuration not yet turned on (MFA, password policy,
  consent) and documentation debt, not missing code.
- **Genuinely new, concrete findings from the original pass, independent of auth, still open**: no
  file-size/type/zip-bomb limits on the two real file-handling surfaces (V5); no anti-automation/
  rate-limiting anywhere (V2.4.1).
- **Resolved as a security control, cleanup remaining**: `userId` no longer travels as the trust
  credential in the URL (V14.2.1) — ~8 vestigial, now-inert `?userId=` query params remain in
  client-side code as housekeeping, not a live exposure.
- **Genuinely clean, freshly-verified**: no mass-assignment pattern anywhere, and the one
  prototype-pollution-shaped bug in the codebase was caught and fixed the same session this
  assessment was originally written (V15); the business-logic state machine in `workflow.ts` is a
  real, enforced control, not just a UI convention (V2.3.1); the entire Cookie Setup sub-chapter is
  moot by architecture — this app has no *tracking/preference* cookies, only the one first-party
  session cookie already covered under V7 (V3).
- **Everything else** either cross-references cleanly into the existing five assessments' evidence
  (crypto, headers, injection, access control, logging, dependency hygiene) or is out of scope at
  the same hosting/TLS/procedural boundary those docs already draw.

### Suggested order

1. **Cheap, independent of anything else**: enforce a file-size cap and an extension/content-type
   allowlist on `POST /api/appeals/[id]/attachments`, and a size/ratio guard before the `AdmZip`
   extraction in `src/lib/ncp-client.ts` (V5.2.1–5.2.3).
2. **Cheap cleanup**: remove the ~8 now-vestigial `?userId=` query params from client-side code
   (`DecisionCardPanel.tsx`, `AppealsPanel.tsx`, `NcpFetchForm.tsx`, `HdeuImportForm.tsx`,
   `applications/[id]/page.tsx`) — no security impact left (V14.2.1), purely housekeeping.
3. **Small, scoped**: add explicit `Cache-Control: no-store` to routes serving application/permit
   detail data (V14.2.2/14.3.2), matching the pattern the public permit-status route already uses.
4. **Documentation debt, not code**: a validation-rules document (V2.1.x), a cryptographic/secrets
   inventory (V11.1.x/13.1.1), a logging inventory (V16.1.1), and an authentication/session-
   management design note (V6.1.x/V7.1.x) — all "verify the documentation defines X" gaps with no
   code change required.
5. **Before any real (non-demo) rollout**: an independent review of the Keycloak realm config
   itself (password policy, MFA, consent — V6.2/6.5/10.7), and the eventual DigiD/eHerkenning
   integration this Keycloak setup stands in for today.
