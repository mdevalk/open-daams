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
> **Scope boundary — same as `docs/bio2-assessment.md`**: this assesses the **application only**,
> not a datacenter/hosting/facilities context (a separate DAAMS work package), and **not the
> health data itself** — DAAMS never handles it (that happens at the data holder/SPE, both outside
> this back-office application's boundary, per `CLAUDE.md`'s scope note). Where a NIS2 measure
> would otherwise touch either boundary (business continuity's physical/facility angle; supply
> chain risk to health-data content), it's narrowed accordingly and stated plainly.
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
| (a) Risk analysis & security policy | ℹ️ Organizational | No written risk-analysis methodology or policy document in the repo | 5.1, 5.9/5.12 |
| (b) Incident handling | ⚠️ Open | Logging real for successes (OWASP A09); no response procedure, no CSIRT reporting chain | 5.24–5.28, 8.16 |
| (c) Business continuity | ⚠️ Open, narrowed | No backup config for the app's own Postgres data; facility-level continuity out of scope | 5.30, 8.13 (8.14 excluded) |
| (d) Supply chain security | ⚠️ Open | Two `"*"`-pinned dependencies; no vendor risk process | 5.19/5.21/5.22 |
| (e) Secure development, vulnerability handling | ⚠️ Partial | `npm audit` clean, but nothing runs it in CI (none exists) | 8.8, 8.25–8.29 |
| (f) Effectiveness assessment | ⚠️ Open | No automated test/audit runs in CI; `npm run test` exists but isn't wired to run automatically | 5.35/5.36 |
| (g) Cyber hygiene & training | ℹ️ Organizational | Not code | 6.3 |
| (h) Cryptography | ✅ Clean | Ed25519 signing (OWASP A02); TLS termination is a deployment concern | 8.24 |
| (i) HR security, access control, asset management | ⚠️ Open (root gap) | Role enforcement real and consistent; no identity behind the role | 5.15–5.18, 8.2/8.3, 6.x |
| (j) MFA / secure comms | ❌ Not present | No authentication at all — downstream of (i)'s root gap, not separate | 8.5, 8.20/8.21 |

## Findings

### (a) Risk analysis & security policy ℹ️ Organizational

No written risk-analysis methodology or information-security policy document exists in the repo —
this is an organizational artifact, not something a codebase check can produce. Scope note: any
future risk analysis would correctly exclude health-data-content risk from this application's own
assessment, since DAAMS doesn't hold that data.

### (b) Incident handling ⚠️ Open

`ApplicationLog`/`DataPermitLog`/`SpeProvisioningLog`/`AuditLog` give real internal recording for
successful actions (OWASP A09, `docs/bio2-assessment.md` 5.24–5.28) — but only successes: a
rejected write (403, failed validation) leaves zero trace, which directly undercuts this
category's own purpose (detecting a pattern of unauthorized attempts). Beyond recording, there is
no incident-*response* process at all: no triage, no containment step, and critically, none of the
NIS2 Art. 23 reporting chain (24-hour early warning, 72-hour notification, 1-month final report to
the CSIRT/competent authority) is wired to anything — even fixing the logging gap wouldn't produce
those three deadlines on its own; they'd need to be built as an operational procedure.

### (c) Business continuity ⚠️ Open, narrowed to the application layer

`docker-compose.yml`'s Postgres volume has no backup or replication configuration — this is the
application-layer slice of business continuity (protecting the app's own data), which stays in
scope. Facility-level continuity (power, physical redundancy, alternate sites) is excluded per
this document's datacenter boundary, same as `docs/bio2-assessment.md`'s 8.14.

### (d) Supply chain security ⚠️ Open

`@rijkshuisstijl-community/components-react` and `@rijkshuisstijl-community/design-tokens` remain
pinned to `"*"` (OWASP A06) — non-reproducible builds, auto-pulls any future publish including a
compromised one. No vendor/supplier risk process beyond that — a narrow, single-vendor npm
dependency tree, no third-party API integrations besides the NCP (which is EHDS-mandated
infrastructure, not a discretionary supplier).

### (e) Secure development & vulnerability handling ⚠️ Partial

`npm audit` reports 0 vulnerabilities today (OWASP A06), and the codebase itself is clean on
injection/secure-coding grounds (OWASP A03, `docs/bio2-assessment.md` 8.25–8.29) — but nothing
automates either check. No `.github/workflows` or any CI configuration exists in this repo at all,
so "clean" is only true as of whenever someone last ran the checks by hand.

### (f) Effectiveness assessment ⚠️ Open

Same root cause as (e): `npm run test` (Vitest) exists and passes, but isn't wired to run
automatically on any change. Assessment of whether security measures remain effective currently
depends entirely on someone remembering to check.

### (g) Cyber hygiene & training ℹ️ Organizational

Not code — no employees, no training program, for a reference implementation with no real
organization behind it.

### (h) Cryptography ✅ Clean

Ed25519 via `@noble/ed25519` (OWASP A02) — modern, audited, correct canonicalization before
signing, public JWKS never exposes the private key. TLS/HTTPS itself is a deployment concern, not
an application-code one — HSTS is sent unconditionally (OWASP A05) but has no effect until TLS
terminates in front of the app.

### (i) HR security, access control, asset management ⚠️ Open (root gap)

The finding every assessment this session converges on: `src/lib/authz.ts`'s
`requireRole`/`requireRoleOrOwner` enforce role correctly and consistently (OWASP A01,
`docs/bio2-assessment.md` 5.15–5.18) — but there's no real identity behind the client-supplied
`userId` (OWASP A07). HR-security aspects of this measure (screening, onboarding/offboarding) are
organizational (BIO2's People theme, 6.x) and out of scope for a codebase check regardless.

### (j) MFA / secure communications ❌ Not present

No authentication exists at all, so multi-factor authentication can't yet be a meaningful
question — this is entirely downstream of (i)'s root gap, not an independent finding. Secure
communications at the application-network layer (CSP headers, hardcoded outbound host) are already
covered under OWASP A05/A10 and `docs/bio2-assessment.md` 8.20/8.21; secure emergency-communication
systems are an organizational/operational concern outside this scope.

## Bottom line

The technical picture mirrors both the OWASP and BIO2 assessments closely, since it's the same
underlying facts read through NIS2's coarser ten-item lens: authentication (i)/(j) is the one open
root gap touching the most categories, dependency pinning (d) is a small concrete fix, and
cryptography (h) is already clean. What NIS2 surfaces that neither OWASP nor BIO2's *technical*
controls fully capture on their own is the **process and legal layer**: there is no CI-enforced
effectiveness check (f), no incident-*response* procedure beyond logging (b), no continuity plan
(c), and — entirely outside any codebase's reach — no incident-reporting chain to a CSIRT (Art.
23), no registration/self-classification, and no management-liability structure (Art. 20), since
this reference implementation has no real organization behind it to hold any of those.

### Suggested order

1. **Independent of auth, cheap**: pin the two `"*"` dependencies (d); add a CI workflow running
   `npm audit` + `npm run test` on every push (e, f) — currently zero automation exists.
2. **Write down what already exists as policy**: a short risk-analysis/security-policy document
   (a) and an application-layer backup/continuity note (c) — the technical facts are already in
   this assessment and its siblings; what's missing is the document itself.
3. **The real fix, shared with every other assessment this session**: real authentication —
   resolves (i) and unblocks (j).
4. **Build the process layer**: an incident-response procedure with the Art. 23 CSIRT-reporting
   timeline (b) — genuinely new work, not a code fix, and not achievable by this codebase alone.
