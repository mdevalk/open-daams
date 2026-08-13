# BIO2 assessment: open-daams

_Snapshot date: 2026-08-13 (updated same day: dependency pinning + CI landed; scope tightened to
exclude service-management/HDAB-establishment processes; rejected/unauthorized attempts and the
remaining case-workflow actions now logged)._

This assesses the open-daams codebase against **BIO2**, the Dutch public sector's information
security baseline built on **ISO/IEC 27002:2022** — a structurally different control set from the
original BIO (which followed the older ISO 27001:2013 Annex A, 14-domain model). BIO2 organizes
its 93 controls into 4 themes: **Organizational** (5.1–5.37), **People** (6.1–6.8), **Physical**
(7.1–7.14), **Technological** (8.1–8.34). It complements `docs/owasp-top10-assessment.md` — most
Technological-theme findings reuse that assessment's evidence directly rather than re-deriving it.

> **Framing.** Same as the other assessments: test data only, authentication stubbed — written
> against the bar a real deployment would need to clear, not a certification or ENSIA attestation.
>
> **Scope boundary — three things excluded, stated plainly, not silently omitted:**
> 1. **Datacenter/hosting/facilities** — a separate DAAMS work package. Excludes the entire
>    Physical theme, and narrows several Technological controls to their application-layer slice.
> 2. **The health data itself** — DAAMS never handles it; that happens at the data holder or the
>    SPE, both outside this back-office application's boundary (per `CLAUDE.md`'s scope note that
>    data-holder extraction and the SPE are simulated shells). Excludes controls about protecting
>    health-data *content* (masking, leakage prevention).
> 3. **Service-management / procedural processes** — incident response, business-continuity
>    *planning*, training, documented operating procedures, change-management process, monitoring
>    operations, and similar are activities that belong to **establishing the actual HDAB
>    organization** that would run this system — not to DAAMS application development. Where a
>    control has both a code-checkable slice and a process slice (e.g. incident management:
>    logging is code, response process is not), only the code slice is assessed; the process slice
>    is named and set aside rather than treated as a gap "the codebase should fix."
>
> **Legend**: ✅ clean/fixed and in scope · ⚠️ open gap, in scope · ➖ out of scope (reason given) ·
> ℹ️ not applicable to this kind of application · ❌ clearly absent.

## Physical (7.1–7.14) — out of scope (datacenter)

All 14 controls in this theme (physical security perimeters, entry control, securing offices,
physical security monitoring, protection against environmental threats, working in secure areas,
clear desk/clear screen, equipment siting, security of assets off-premises, storage media,
supporting utilities, cabling security, equipment maintenance, secure disposal) are facility- or
equipment-scoped. None have an application-code analogue — this is a datacenter/hosting concern,
a separate work package for DAAMS. No per-control table; excluded wholesale.

## People (6.1–6.8) — out of scope (HDAB establishment)

| Control | Status |
|---|---|
| 6.1 Screening | ➖ Out of scope |
| 6.2 Terms and conditions of employment | ➖ Out of scope |
| 6.3 Security awareness, education and training | ➖ Out of scope |
| 6.4 Disciplinary process | ➖ Out of scope |
| 6.5 Responsibilities after termination/change of employment | ➖ Out of scope |
| 6.6 Confidentiality or non-disclosure agreements | ➖ Out of scope |
| 6.7 Remote working | ➖ Out of scope |
| 6.8 Information security event reporting | ➖ Out of scope |

All eight are HR/people processes for the organization that would operate DAAMS — part of
establishing that HDAB, not application development. Nothing here is checkable against a
codebase. Stated as a complete theme, not omitted.

## Organizational (5.1–5.37)

| Control | Status | Key finding |
|---|---|---|
| 5.1 Policies for information security | ➖ Out of scope (HDAB establishment) | Policy documents |
| 5.2 Information security roles and responsibilities | ➖ Out of scope (HDAB establishment) | Named role-owner |
| 5.3 Segregation of duties | ✅ Real | See below |
| 5.4 Management responsibilities | ➖ Out of scope (HDAB establishment) | — |
| 5.5 Contact with authorities | ➖ Out of scope (HDAB establishment) | — |
| 5.6 Contact with special interest groups | ➖ Out of scope (HDAB establishment) | — |
| 5.7 Threat intelligence | ➖ Out of scope (HDAB establishment) | Subscription/process |
| 5.8 Information security in project management | ➖ Out of scope (HDAB establishment) | — |
| 5.9 Inventory of information and other assets | ⚠️ Open | No formal asset/data inventory |
| 5.10 Acceptable use of assets | ➖ Out of scope (HDAB establishment) | No organizational assets to govern |
| 5.11 Return of assets | ➖ Out of scope (HDAB establishment) | — |
| 5.12 Classification of information | ⚠️ Open | See below |
| 5.13 Labelling of information | ⚠️ Open | Follows from 5.12 — no classification, so nothing to label |
| 5.14 Information transfer | ✅ Clean | Reuses OWASP A10 — hardcoded outbound host, no user-controlled transfer target |
| 5.15 Access control | ⚠️ Open (root gap) | See below |
| 5.16 Identity management | ⚠️ Open (root gap) | See below |
| 5.17 Authentication information | ❌ N/A | No authentication exists, so there's no authentication information to manage |
| 5.18 Access rights | ✅ Partial | Role-based, correctly enforced; provisioning/de-provisioning is a direct DB write, no process |
| 5.19 Supplier relationships | ✅ Fixed | Both dependencies now pinned to exact versions |
| 5.20 Supplier agreements | ➖ Out of scope (HDAB establishment) | No suppliers with contracts — npm dependency tree only |
| 5.21 ICT supply chain | ✅ Fixed | Same as 5.19 |
| 5.22 Monitoring/review of supplier services | ✅ Improved | `npm audit` now runs on every push via CI |
| 5.23 Cloud services security | ℹ️ N/A | No cloud services used — self-hosted Postgres via `docker-compose.yml` |
| 5.24 Incident management planning | ➖ Out of scope (HDAB establishment) | Planning process |
| 5.25 Assessment/decision on security events | ➖ Out of scope (HDAB establishment) | Decision process |
| 5.26 Response to incidents | ➖ Out of scope (HDAB establishment) | Response process |
| 5.27 Learning from incidents | ➖ Out of scope (HDAB establishment) | Post-incident review process |
| 5.28 Collection of evidence | ✅ Fixed, code slice only | The evidence source (logging) now covers rejections too — see 8.15/OWASP A09; the collection *process* remains out of scope |
| 5.29 Security during disruption | ➖ Out of scope (HDAB establishment) | — |
| 5.30 ICT readiness for business continuity | ⚠️ Open, code slice only | No backup config (repo fact); continuity *planning* is out of scope |
| 5.31 Legal, statutory, regulatory, contractual requirements | ✅ Partial | See below |
| 5.32 Intellectual property rights | ➖ Out of scope (HDAB establishment) | — |
| 5.33 Protection of records | ⚠️ Open | See below |
| 5.34 Privacy and protection of PII | ✅ Partial | See below |
| 5.35 Independent review of information security | ✅ Clean | This document family *is* that review |
| 5.36 Compliance with policies/standards | ✅ Clean | Same as 5.35 |
| 5.37 Documented operating procedures | ➖ Out of scope (HDAB establishment) | Runbooks are an operational artifact of running the org, not building the app |

### 5.3 — Segregation of duties ✅ Real

More than RBAC labels: `src/lib/permit-change.ts` defines `REQUEST_ROLES`
(`CASE_HANDLER`/`DECISION_MAKER`/`ADMIN`) and `DECIDE_ROLES` (`DECISION_MAKER`/`ADMIN`) as
*separate* constants — a case handler can raise an amendment/renewal/appeal but cannot approve
their own request. The same split exists for the core decision workflow in `src/lib/workflow.ts`'s
`TRANSITIONS` table. Genuine duty separation, not just role checks.

### 5.9/5.12/5.13 — Asset inventory & classification ⚠️ Open

No field or process classifies data by sensitivity. `Application.purposeCategory`/`legalBasis`
are the closest things that exist, but they describe the *purpose* of processing, not a
sensitivity classification of the data itself. A real deployment would want an explicit
classification scheme, even a simple one — this is a data-modeling question for the application
itself, not an HDAB-establishment process, so it stays in scope.

### 5.15/5.16/5.17/5.18 — Access control & identity ⚠️ Open (root gap)

The single most-repeated finding across every assessment this session: `src/lib/authz.ts`'s
`requireRole`/`requireRoleOrOwner` enforce role correctly and consistently (confirmed live,
matching OWASP A01) — but there is no identity behind the role. A client-supplied `userId` is
trusted outright (OWASP A07). 5.17 doesn't even apply in the usual sense — there's no
authentication information (password, token, credential) to protect, because there's no
authentication step at all. 5.18's access-*rights* are fine (role-scoped, fail closed on
missing/invalid id); access *provisioning* is a direct database write, no request/approval
process — reasonable for a reference implementation, a real gap for a production baseline.

### 5.19/5.21/5.22 — Supplier & ICT supply chain ✅ Fixed

`@rijkshuisstijl-community/components-react` and `@rijkshuisstijl-community/design-tokens` —
previously pinned to `"*"` (OWASP A06), a non-reproducible-build gap — are now pinned to the exact
versions already in use (`15.1.2`/`16.1.0`); confirmed a behavioural no-op (`npx tsc --noEmit`
clean, 55/55 tests before and after). Advisory monitoring also improved: `.github/workflows/ci.yml`
(new) runs `npm audit` on every push and pull request — not a scheduled/periodic scan (nothing
catches a newly-disclosed CVE on an otherwise-unchanged dependency until the next push), but a real
step up from the previous "only if someone runs it by hand" state.

### 5.24–5.27 — Incident management process ➖ Out of scope (HDAB establishment)

Planning, event assessment/decision, response, and post-incident learning are all organizational
processes an operating HDAB would run — none have an application-code artifact. What *is*
code-checkable is covered separately: 5.28 (the evidence source) and 8.15 below.

### 5.28 — Collection of evidence ✅ Fixed, code slice only

The evidence an incident investigation would draw on is exactly what `docs/owasp-top10-assessment.md`'s
A09 already assesses, and A09 is now fully closed: `ApplicationLog`/`DataPermitLog`/
`SpeProvisioningLog` cover status transitions, `AuditLog` now covers every other mutation
(reference-data CRUD plus the case-workflow actions — authorized persons, appeals, invoices,
trusted-data-holder — that were the last unlogged gap), and `AuthzFailureLog` records every
rejection from `src/lib/authz.ts` (missing/invalid user id, unknown user, role-not-permitted).
Verified live via real requests for both the rejection cases and a representative sample of the
case-workflow actions. The collection *process* itself (who pulls it, in what format, chain of
custody) remains out of scope, same as 5.24–5.27.

### 5.30 — ICT readiness for business continuity ⚠️ Open, code slice only

`docker-compose.yml`'s Postgres volume has no backup or replication configuration — a concrete
repo-level fact, in scope. Continuity *planning* as a document/process is out of scope (HDAB
establishment), same as `docs/nis2-assessment.md`'s treatment of (c).

### 5.31/5.34 — Legal requirements & PII protection ✅ Partial

Scoped to the applicant/contact PII DAAMS actually stores — names, emails, organisations on
`Application` — not health-data content (out of scope per this document's framing, same boundary
as 8.11/8.12 below). `docs/ehds-gap-analysis.md` already tracks EHDS-specific legal alignment; a
full GDPR/AVG-specific assessment was scoped for a separate effort and isn't repeated here.

### 5.33 — Protection of records ⚠️ Open

The permit detail page shows a "Retention deadline (Art. 68(12))"
(`src/app/[locale]/permits/[id]/page.tsx:164`) — but it's `addMonths(permit.validUntil, 6)`,
computed **at display time**, not a stored field, and nothing enforces or acts on it when the date
passes. The obligation is correctly surfaced to staff; nothing currently executes on it. This is a
code fix (a stored, enforced field), not a process question, so it stays in scope.

## Technological (8.1–8.34)

| Control | Status | Key finding |
|---|---|---|
| 8.1 User endpoint devices | ℹ️ N/A | No app-managed endpoints — browser-based staff UI only |
| 8.2 Privileged access rights | ✅ Clean | ≈ OWASP A01 — role-scoped, no privilege-escalation path found |
| 8.3 Information access restriction | ✅ Clean | ≈ OWASP A01 |
| 8.4 Access to source code | ✅ Deliberate | Repo is intentionally public (MIT-licensed) — a choice, not an oversight |
| 8.5 Secure authentication | ⚠️ Open (root gap) | ≈ OWASP A07 — see 5.15–5.18 above |
| 8.6 Capacity management | ℹ️ N/A | Not modeled — reasonable for this scope |
| 8.7 Malware protection | ⚠️ Partial | See below |
| 8.8 Management of technical vulnerabilities | ✅ Fixed | `npm audit` clean, now enforced on every push via `.github/workflows/ci.yml` |
| 8.9 Configuration management | ✅ Clean | `.env`/`.env.example`; no infrastructure-as-code, reasonable for this scope |
| 8.10 Information deletion | ⚠️ Open | Same as 5.33 — application/permit metadata only, not health-data content |
| 8.11 Data masking | ➖ Out of scope | Health-data content — DAAMS never handles it |
| 8.12 Data leakage prevention | ➖ Out of scope | Same boundary as 8.11 |
| 8.13 Backup | ⚠️ Open | No backup configuration found (the code slice of 5.30) |
| 8.14 Redundancy | ➖ Out of scope | Datacenter concern |
| 8.15 Logging | ✅ Fixed | ≈ OWASP A09, now fully closed — every mutation (status transitions, other successful actions, rejected/unauthorized attempts) leaves a trace; see 5.28 |
| 8.16 Monitoring activities | ➖ Out of scope (HDAB establishment) | Watching/responding to what's logged is an operational activity, not a code artifact |
| 8.17 Clock synchronization | ℹ️ N/A | — |
| 8.18 Use of privileged utility programs | ℹ️ N/A | — |
| 8.19 Installation of software on operational systems | ℹ️ N/A | Deployment concern |
| 8.20 Networks security | ✅ Partial | Application-layer slice only — CSP headers (`src/proxy.ts`, OWASP A05); true network topology out of scope (datacenter) |
| 8.21 Security of network services | ✅ Partial | Hardcoded outbound host (OWASP A10) |
| 8.22 Segregation of networks | ➖ Out of scope | Datacenter concern |
| 8.23 Web filtering | ℹ️ N/A | — |
| 8.24 Use of cryptography | ✅ Clean | ≈ OWASP A02 |
| 8.25 Secure development life cycle | ✅ Clean | See below |
| 8.26 Application security requirements | ✅ Clean | ≈ OWASP A03 — typed queries, no injection surface |
| 8.27 Secure system architecture and engineering | ✅ Clean | Same evidence as 8.26 |
| 8.28 Secure coding | ✅ Clean | Same evidence as 8.26 |
| 8.29 Security testing in development/acceptance | ✅ Fixed | `npm run test` now runs on every push via `.github/workflows/ci.yml` |
| 8.30 Outsourced development | ℹ️ N/A | Not outsourced |
| 8.31 Separation of dev/test/production | ✅ Real | See below |
| 8.32 Change management | ➖ Out of scope (HDAB establishment), code slice clean | Git history is a real, checkable mechanism (in scope, clean); formal approval process is operational |
| 8.33 Test information | ⚠️ Stated, not enforced | See below |
| 8.34 Protection of systems during audit testing | ℹ️ N/A | No audit-testing infrastructure exists |

### 8.7 — Malware protection ⚠️ Partial

`Attachment` (`prisma/schema.prisma:643-656`) stores raw file `content: Bytes` with a
self-reported `mimeType` — no content validation or scanning. The only writer is the NCP import
path (`src/app/api/import/ncp-applications/[id]/attachments/[filename]/route.ts`), extracting from
a ZIP archive — there's no user-facing upload endpoint accepting arbitrary files today, which
narrows the practical surface, but doesn't close the underlying gap: nothing would catch a
malicious file arriving via that import path either. This is a code fix (validation logic), so it
stays in scope, unlike 8.16's operational monitoring.

### 8.25 — Secure development life cycle ✅ Clean

Strong on the static-analysis side (typed Prisma queries throughout, zero raw SQL/`eval`, per
OWASP A03) and on environment separation (8.31, below). The automated-testing gap noted here
previously — no CI running `npm run test`/`npm audit` on any change — is now closed by
`.github/workflows/ci.yml`, which runs both on every push and pull request.

### 8.31 — Separation of development, test and production ✅ Real

Genuine, checkable behavioural difference, not just a naming convention: `src/proxy.ts`'s CSP only
permits `'unsafe-eval'`/`'unsafe-inline'` when `NODE_ENV` is not production (needed for React
dev-mode and Turbopack Fast Refresh) — verified in both `next dev` and a production `next
build`/`next start` (OWASP A05). The security posture actually changes between environments.

### 8.33 — Test information ⚠️ Stated, not enforced

`docs/architecture.md`'s compliance table states the app runs on "test data only," and this
assessment's own framing repeats that. Checked directly: there is no code-level enforcement of
this — no environment guard, no data-validation step preventing real personal data from being
entered. It's a stated operating intent, not a technical control — but unlike the process items
above, an enforcement mechanism (were one built) would be application code, so this stays in scope
rather than moving to HDAB-establishment.

## Bottom line

Tightened to application code plus its three explicit exclusions (datacenter, health-data
content, HDAB-establishment process), this assessment resolves cleanly. **In scope and mostly
already covered by the OWASP doc**: no real authentication behind an otherwise correctly-enforced
role system (5.15–5.18/8.5) — the single highest-leverage item remaining — plus a handful of small,
concrete repo-level facts: no data-classification scheme (5.9/5.12/5.13), no backup configuration
(5.30/8.13), unvalidated attachment content (8.7), and the retention-deadline-computed-not-enforced
finding (5.33/8.10). Dependency pinning and CI (5.19/5.21/5.22, 8.8, 8.29) are now fixed, and so is
the evidence-source half of incident management: every mutation now leaves a trace — status
transitions, other successful case-workflow actions, and rejected/unauthorized attempts alike
(5.28/8.15). Cryptography, injection-safety, and environment separation are clean. **Everything else this
document names is out of scope, and correctly so**: an operating HDAB's incident-response process,
training, documented procedures, change-approval process, and monitoring operations
(5.1/5.2/5.4–5.8/5.10/5.11/5.20/5.24–5.27/5.29/5.32/5.37, all of People, 8.16, the process half of
8.32) belong to *establishing that organization*, not to building this application — a distinction
worth keeping sharp, since conflating the two is exactly what would make a future real assessment
overstate what a codebase review can actually tell you.

### Suggested order

1. ~~**Cheap, independent of auth**: pin the two `"*"` dependencies (5.19/5.21); add a CI workflow
   running `npm audit` + `npm run test` on every push (8.8/8.29).~~ **Done** — see 5.19/5.21/5.22
   and 8.8/8.25/8.29 above.
2. **Small, concrete, code-level**: a lightweight data-classification field (5.9/5.12/5.13);
   backup/replication configuration for the application's own Postgres data (5.30/8.13); content
   validation on the `Attachment` import path (8.7).
3. **The real fix, shared with every other assessment this session**: real authentication —
   resolves 5.15–5.18 and 8.5.
4. **Close the loop on deletion**: make the retention deadline a stored, enforced field rather
   than a display-time computation (5.33/8.10).

Everything named "out of scope (HDAB establishment)" above is a separate, organizational
workstream for whoever stands up a real HDAB on top of this codebase — not a follow-up item here.
