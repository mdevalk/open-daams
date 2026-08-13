# NIS2 assessment: open-daams

_Snapshot date: 2026-08-13._

This assesses the open-daams codebase against **NIS2** (Directive (EU) 2022/2555), as transposed
into Dutch law via the *Cyberbeveiligingswet* (Cbw). It complements `docs/owasp-top10-assessment.md`
and `docs/bio2-assessment.md` — NIS2 Art. 21(2)'s ten measures are largely the same underlying
facts as those two documents, read through NIS2's coarser lens; this doc cross-references both
rather than re-deriving their evidence.

> **Framing.** Same as the other assessments: test data only, authentication stubbed — written
> against the bar a real deployment would need to clear, not a certification.
>
> **Scope boundary — narrower than `docs/bio2-assessment.md`'s, read carefully**: this assesses
> the **application code only**. Three things are explicitly out of scope, not silently omitted:
> 1. **Datacenter/hosting/facilities** — a separate DAAMS work package (same as the BIO2 doc).
> 2. **The health data itself** — DAAMS never handles it; that happens at the data holder/SPE,
>    outside this back-office application's boundary (per `CLAUDE.md`'s scope note).
> 3. **Procedural / service-management context** — incident-response procedures, the Art. 23
>    CSIRT-reporting chain, registration/self-classification, management-liability structures
>    (Art. 20), training programs, and vendor-risk-management processes are all organizational
>    activities with no application-code artifact — they're stated as out of scope below, not
>    assessed as gaps "the codebase should fix." Where a NIS2 measure has *both* a code-checkable
>    slice and a procedural slice (e.g. (b) incident handling: logging is code, response process
>    is procedure), only the code slice is assessed; the procedural slice is named and set aside.
>
> **Applicability**: a real HDAB is plausibly in NIS2 scope on two independent grounds — the
> health sector is explicitly listed in NIS2 Annex I, and a statutory public-administration body is
> separately in scope under Annex I's public-administration entry. This assessment doesn't attempt
> to resolve essential-vs-important classification (depends on entity-size criteria this fictional
> HDAB has no real-world values for) — it assumes some NIS2 obligation applies and assesses
> against Art. 21(2) regardless of tier.

## Summary

| NIS2 Art. 21(2) | Status | Key finding | → BIO2 controls |
|---|---|---|---|
| (a) Risk analysis & security policy | ➖ Out of scope (procedural) | Risk-analysis methodology and policy documents are organizational artifacts, no code slice exists | 5.1, 5.9/5.12 |
| (b) Incident handling | ⚠️ Partial, code slice only | Logging real for successes (OWASP A09), nothing for rejected attempts — the response process/CSIRT chain is out of scope (procedural) | 5.24–5.28, 8.16 |
| (c) Business continuity | ⚠️ Open, code slice only | No backup config for the app's own Postgres data in the repo — facility continuity and continuity *planning* are out of scope | 5.30, 8.13 |
| (d) Supply chain security | ⚠️ Open, code slice only | Two `"*"`-pinned dependencies in `package.json` — vendor-risk process is out of scope (procedural) | 5.19/5.21/5.22 |
| (e) Secure development, vulnerability handling | ⚠️ Partial | `npm audit` clean, but no CI config in the repo runs it automatically | 8.8, 8.25–8.29 |
| (f) Effectiveness assessment | ⚠️ Open, code slice only | No CI config runs the existing test suite automatically; broader assessment process is out of scope (procedural) | 5.35/5.36 |
| (g) Cyber hygiene & training | ➖ Out of scope (procedural) | Training program — organizational | 6.3 |
| (h) Cryptography | ✅ Clean | Ed25519 signing (OWASP A02); TLS termination is a deployment concern | 8.24 |
| (i) HR security, access control, asset management | ⚠️ Open (root gap), code slice only | Role enforcement real and consistent; no identity behind the role — HR-security aspects out of scope (procedural) | 5.15–5.18, 8.2/8.3 |
| (j) MFA / secure comms | ❌ Not present | No authentication at all — downstream of (i)'s root gap; emergency-communication systems out of scope (procedural) | 8.5, 8.20/8.21 |

## Findings

### (a) Risk analysis & security policy ➖ Out of scope (procedural)

A risk-analysis methodology and an information-security policy document are organizational
artifacts with no application-code equivalent — there's nothing in a codebase that *is* a risk
analysis. Not assessed as a gap; named so the boundary is explicit rather than silently skipped.

### (b) Incident handling ⚠️ Partial — code slice only

The code-checkable slice: `ApplicationLog`/`DataPermitLog`/`SpeProvisioningLog`/`AuditLog` give
real internal recording for successful actions (OWASP A09, `docs/bio2-assessment.md` 5.24–5.28) —
but only successes; a rejected write (403, failed validation) leaves zero trace, which undercuts
this category's own purpose of detecting a pattern of unauthorized attempts. **Out of scope**: the
incident-*response* process (triage, containment) and the NIS2 Art. 23 reporting chain (24-hour
early warning, 72-hour notification, 1-month final report to the CSIRT/competent authority) are
procedural — even a perfect logging fix wouldn't produce either on its own, and neither has a
code artifact to check.

### (c) Business continuity ⚠️ Open — code slice only

`docker-compose.yml`'s Postgres volume has no backup or replication configuration — a concrete,
repo-level fact, in scope. **Out of scope**: facility-level continuity (power, physical
redundancy, alternate sites — the same datacenter boundary as `docs/bio2-assessment.md`'s 8.14)
and continuity *planning* as a document/process (procedural).

### (d) Supply chain security ⚠️ Open — code slice only

`@rijkshuisstijl-community/components-react` and `@rijkshuisstijl-community/design-tokens` remain
pinned to `"*"` in `package.json` (OWASP A06) — non-reproducible builds, auto-pulls any future
publish including a compromised one. **Out of scope**: vendor-risk-assessment process (procedural)
— the codebase can show *what* is depended on, not whether a supplier was vetted.

### (e) Secure development & vulnerability handling ⚠️ Partial

`npm audit` reports 0 vulnerabilities today (OWASP A06), and the codebase itself is clean on
injection/secure-coding grounds (OWASP A03, `docs/bio2-assessment.md` 8.25–8.29). No
`.github/workflows` or any CI configuration exists in this repo, so nothing runs `npm audit`
automatically — this is a repo-config fact (a missing file), not a procedural gap, so it stays in
scope: "clean" is only true as of whenever someone last ran the check by hand.

### (f) Effectiveness assessment ⚠️ Open — code slice only

Same repo-config fact as (e): `npm run test` (Vitest) exists and passes, but no CI configuration
runs it automatically on any change. **Out of scope**: the broader organizational question of who
reviews results and how often (procedural service management).

### (g) Cyber hygiene & training ➖ Out of scope (procedural)

A training program has no application-code artifact — organizational, for a reference
implementation with no real organization or employees behind it.

### (h) Cryptography ✅ Clean

Ed25519 via `@noble/ed25519` (OWASP A02) — modern, audited, correct canonicalization before
signing, public JWKS never exposes the private key. TLS/HTTPS itself is a deployment concern, not
an application-code one — HSTS is sent unconditionally (OWASP A05) but has no effect until TLS
terminates in front of the app.

### (i) HR security, access control, asset management ⚠️ Open (root gap) — code slice only

The finding every assessment this session converges on: `src/lib/authz.ts`'s
`requireRole`/`requireRoleOrOwner` enforce role correctly and consistently (OWASP A01,
`docs/bio2-assessment.md` 5.15–5.18) — but there's no real identity behind the client-supplied
`userId` (OWASP A07). **Out of scope**: the HR-security aspects of this measure (screening,
onboarding/offboarding process) are procedural (BIO2's People theme, 6.x).

### (j) MFA / secure communications ❌ Not present

No authentication exists at all, so multi-factor authentication can't yet be a meaningful
question — entirely downstream of (i)'s root gap, not an independent finding. Secure
communications at the application-network layer (CSP headers, hardcoded outbound host) are already
covered under OWASP A05/A10 and `docs/bio2-assessment.md` 8.20/8.21. **Out of scope**: secure
emergency-communication systems (procedural/operational).

## Bottom line

Narrowed to the application code only, this assessment resolves into two clean groups. **In
scope, checkable, and mostly already covered by the OWASP/BIO2 docs**: no real authentication
behind an otherwise correctly-enforced role system (i)/(j) — the single highest-leverage item —
plus three small, concrete repo-level facts: two pinned dependencies (d), no CI configuration for
either vulnerability scanning or the existing test suite (e)/(f), and no backup configuration for
the application's own database (c). Cryptography (h) is clean. **Explicitly out of scope, and
correctly so given this is an application-only review**: risk-analysis/policy documents (a),
incident-*response* process and the Art. 23 CSIRT-reporting chain (b), training programs (g),
vendor-risk process (d), HR-security process (i), and emergency-communication systems (j) — none
of these have an application-code artifact, and a reference implementation with no real
organization behind it has nowhere to put one even if it tried.

### Suggested order

1. **Cheap, independent of auth**: pin the two `"*"` dependencies (d); add a CI workflow running
   `npm audit` + `npm run test` on every push (e, f) — currently zero automation exists in the
   repo for either.
2. **Small, concrete**: add backup/replication configuration for the application's own Postgres
   data (c) — the one remaining code-level gap besides authentication.
3. **The real fix, shared with every other assessment this session**: real authentication —
   resolves (i) and unblocks (j).

Everything else this document names as out of scope (a, the procedural half of b, g, the
procedural half of d, the procedural half of i, the procedural half of j) is a separate,
organizational workstream — not a follow-up item for this codebase.
