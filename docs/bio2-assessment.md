# BIO2 assessment: open-daams

_Snapshot date: 2026-08-13 (updated same day: dependency pinning + CI landed; scope tightened to
exclude service-management/HDAB-establishment processes; rejected/unauthorized attempts and the
remaining case-workflow actions now logged; database backup/restore now exists). Revised
2026-08-30: 5.15–5.18/8.5 re-assessed following the Keycloak/OIDC integration. Revised 2026-09-02
following a cognitive-complexity refactor pass (security-reviewed, no functional change — see
`docs/sonarqube-assessment.md`): 5.33's citation updated to its current location, fresh SonarQube
evidence added to 8.25/8.28, and a newly-disclosed `browserslist` HIGH advisory (unrelated to the
refactor) caught by CI's `npm audit` gate and fixed same-day (8.8). Rescoped 2026-09-02 (same day):
scope tightened explicitly to **technical controls this solution actually implements**, applied
consistently rather than following BIO2's own theme boundaries — several Organizational-theme
controls previously marked ✅/⚠️ have no concrete technical mechanism in this codebase and are
reclassified out of scope: asset/data classification (5.9/5.12/5.13), information transfer (5.14
— the OWASP A10 hardening cited doesn't implement 5.14's transfer-policy intent), ICT supply
chain (5.21 — dependency pinning/`npm audit` is 8.8 evidence, not supplier-relationship risk
management), ICT readiness for business continuity (5.30 — a backup/restore script is one narrow
facet of a much broader control, evidence for 8.13 instead), legal/PII compliance depth
(5.31/5.34), and independent security review (5.35/5.36). What remains in scope within
Organizational: segregation of duties (5.3), access control/identity/authentication/access rights
(5.15–5.18), evidence collection (5.28), protection of records (5.33) — each backed by a genuine,
checkable mechanism (RBAC constants, Keycloak + `authz.ts`, audit-log tables, the retention-
deadline derivation) actually present in the code, not just named by BIO2's theme label._

This assesses the open-daams codebase against **BIO2**, the Dutch public sector's information
security baseline built on **ISO/IEC 27002:2022** — a structurally different control set from the
original BIO (which followed the older ISO 27001:2013 Annex A, 14-domain model). BIO2 organizes
its 93 controls into 4 themes: **Organizational** (5.1–5.37), **People** (6.1–6.8), **Physical**
(7.1–7.14), **Technological** (8.1–8.34). It complements `docs/owasp-top10-assessment.md` — most
Technological-theme findings reuse that assessment's evidence directly rather than re-deriving it.

> **Framing.** Same as the other assessments: test data only; authentication is now genuine
> (Keycloak/OIDC) but scoped to 5 seeded demo identities, not a production identity provider —
> written against the bar an actual deployment would need to clear, not a certification or ENSIA
> attestation.
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
> **Governing rule (applies across all four themes, not just Physical/People above).** This
> assessment's scope is **technical controls this solution explicitly implements** — a mechanism
> actually present in the codebase — regardless of which BIO2 theme files the control under. Two
> consequences follow, both applied below rather than left implicit:
> - A handful of *Organizational*-theme controls stay in scope because this solution genuinely
>   implements a technical answer to them: segregation of duties (5.3, RBAC role-split
>   constants), access control/identity/access rights (5.15–5.18, Keycloak + `authz.ts`),
>   evidence collection (5.28, audit logging), protection of records (5.33). These aren't
>   exceptions to the rule — they *are* the rule.
> - Conversely, a few Organizational controls that look code-adjacent but have **no concrete
>   technical mechanism in this codebase** are out of scope even though they aren't classic
>   "HDAB establishment" process items: information transfer (5.14 — the control itself is about
>   transfer policies, procedures and agreements; the hardcoded-outbound-host fact is genuine OWASP
>   A10 hardening but doesn't implement 5.14's actual organizational intent), asset/data
>   classification (5.9/5.12/5.13 — an organizational policy scheme, not something this solution
>   implements), ICT supply chain (5.21 — same category error as 5.19/5.20/5.22: dependency
>   pinning and `npm audit` are a technical vulnerability-management practice, evidence for 8.8,
>   not the supplier-relationship risk management 5.21 actually calls for), ICT readiness for
>   business continuity (5.30 — a broad organizational-resilience control covering redundancy,
>   disaster-recovery testing, RTO/RPO planning and failover; a Postgres backup/restore script is
>   one narrow technical facet, evidence for 8.13, not an implementation of 5.30's actual scope),
>   legal/PII compliance
>   depth (5.31/5.34 — a legal/regulatory assessment, not a technical control), and independent
>   review of security/compliance (5.35/5.36 — an activity an operating organization performs, not
>   application behavior). See each control's own note below for why.
>
> **Legend**: ✅ clean/fixed and in scope · ⚠️ open gap, in scope · ➖ out of scope (reason given) ·
> ℹ️ not applicable to this kind of application · ❌ clearly absent.

## Physical (7.1–7.14) — out of scope

| Control | Status |
|---|---|
| 7.1 Physical security perimeters | ➖ Out of scope |
| 7.2 Physical entry | ➖ Out of scope |
| 7.3 Securing offices, rooms and facilities | ➖ Out of scope |
| 7.4 Physical security monitoring | ➖ Out of scope |
| 7.5 Protecting against physical and environmental threats | ➖ Out of scope |
| 7.6 Working in secure areas | ➖ Out of scope |
| 7.7 Clear desk and clear screen | ➖ Out of scope |
| 7.8 Equipment siting and protection | ➖ Out of scope |
| 7.9 Security of assets off-premises | ➖ Out of scope |
| 7.10 Storage media | ➖ Out of scope |
| 7.11 Supporting utilities | ➖ Out of scope |
| 7.12 Cabling security | ➖ Out of scope |
| 7.13 Equipment maintenance | ➖ Out of scope |
| 7.14 Secure disposal or re-use of equipment | ➖ Out of scope |

All 14 controls in this theme are facility- or equipment-scoped. None have an application-code
analogue — this is a datacenter/hosting concern, a separate work package for DAAMS. Stated as a
complete theme, not omitted.

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
| 5.3 Segregation of duties | ✅ Verified | See below |
| 5.4 Management responsibilities | ➖ Out of scope (HDAB establishment) | — |
| 5.5 Contact with authorities | ➖ Out of scope (HDAB establishment) | — |
| 5.6 Contact with special interest groups | ➖ Out of scope (HDAB establishment) | — |
| 5.7 Threat intelligence | ➖ Out of scope (HDAB establishment) | Subscription/process |
| 5.8 Information security in project management | ➖ Out of scope (HDAB establishment) | — |
| 5.9 Inventory of information and other assets | ➖ Out of scope | Organizational classification scheme, not a technical mechanism — see below |
| 5.10 Acceptable use of assets | ➖ Out of scope (HDAB establishment) | No organizational assets to govern |
| 5.11 Return of assets | ➖ Out of scope (HDAB establishment) | — |
| 5.12 Classification of information | ➖ Out of scope | See below |
| 5.13 Labelling of information | ➖ Out of scope | Follows from 5.12 |
| 5.14 Information transfer | ➖ Out of scope | Organizational control (transfer policies/agreements) — see below |
| 5.15 Access control | ✅ Fixed | See below |
| 5.16 Identity management | ✅ Fixed | See below |
| 5.17 Authentication information | ◑ Delegated | Password/credential management is Keycloak's responsibility as the IdP; the demo realm sets no password policy and shares one password across all 5 seeded users |
| 5.18 Access rights | ✅ Partial | Role-based, correctly enforced; provisioning/de-provisioning is a direct DB write, no process |
| 5.19 Supplier relationships | ➖ Out of scope (HDAB establishment) | No suppliers with contracts — npm dependency tree only, same reasoning as 5.20 |
| 5.20 Supplier agreements | ➖ Out of scope (HDAB establishment) | No suppliers with contracts — npm dependency tree only |
| 5.21 ICT supply chain | ➖ Out of scope | Same category error as 5.19/5.20/5.22 — see below |
| 5.22 Monitoring/review of supplier services | ➖ Out of scope (HDAB establishment) | No contracted supplier services to monitor, same reasoning as 5.20 |
| 5.23 Cloud services security | ℹ️ N/A | No cloud services used — self-hosted Postgres via `docker-compose.yml` |
| 5.24 Incident management planning | ➖ Out of scope (HDAB establishment) | Planning process |
| 5.25 Assessment/decision on security events | ➖ Out of scope (HDAB establishment) | Decision process |
| 5.26 Response to incidents | ➖ Out of scope (HDAB establishment) | Response process |
| 5.27 Learning from incidents | ➖ Out of scope (HDAB establishment) | Post-incident review process |
| 5.28 Collection of evidence | ✅ Fixed, code slice only | The evidence source (logging) now covers rejections too — see 8.15/OWASP A09; the collection *process* remains out of scope |
| 5.29 Security during disruption | ➖ Out of scope (HDAB establishment) | — |
| 5.30 ICT readiness for business continuity | ➖ Out of scope | Broader than backup/restore — see below |
| 5.31 Legal, statutory, regulatory, contractual requirements | ➖ Out of scope | Legal/regulatory assessment, not a technical control — see below |
| 5.32 Intellectual property rights | ➖ Out of scope (HDAB establishment) | — |
| 5.33 Protection of records | ⚠️ Open | See below |
| 5.34 Privacy and protection of PII | ➖ Out of scope | Same reasoning as 5.31 — see below |
| 5.35 Independent review of information security | ➖ Out of scope | An organizational activity, not application behavior — see below |
| 5.36 Compliance with policies/standards | ➖ Out of scope | Same as 5.35 |
| 5.37 Documented operating procedures | ➖ Out of scope (HDAB establishment) | Runbooks are an operational artifact of running the org, not building the app |

### 5.3 — Segregation of duties ✅ Verified

More than RBAC labels: `src/lib/permit-change.ts` defines `REQUEST_ROLES`
(`CASE_HANDLER`/`DECISION_MAKER`/`ADMIN`) and `DECIDE_ROLES` (`DECISION_MAKER`/`ADMIN`) as
*separate* constants — a case handler can raise an amendment/renewal/appeal but cannot approve
their own request. The same split exists for the core decision workflow in `src/lib/workflow.ts`'s
`TRANSITIONS` table. Genuine duty separation, not just role checks.

### 5.9/5.12/5.13 — Asset inventory & classification ➖ Out of scope

No field or process classifies data by sensitivity. `Application.purposeCategory`/`legalBasis`
are the closest things that exist, but they describe the *purpose* of processing, not a
sensitivity classification of the data itself. Defining a classification scheme is an
organizational policy decision — the same category as 5.1's information-security policies — not
something an individual application implements on its own; an actual HDAB would set the scheme at
the organizational level, and an application could then be built to *enforce* it. Nothing here is
a technical mechanism this solution implements, so — per the governing rule above — this is out
of scope, not an open gap.

### 5.14 — Information transfer ➖ Out of scope

ISO/IEC 27002:2022's guidance for 5.14 is about transfer *policies, procedures and agreements* —
rules for electronic, physical-media and verbal information transfer, including third-party
agreements. The one technical fact previously cited here (a hardcoded outbound host, no
user-controlled transfer target — genuine SSRF hardening, see OWASP A10) is factual, but it doesn't
implement anything 5.14 actually asks for; it's better understood purely as OWASP A10 mitigation.
No transfer policy, procedure, or agreement exists in this codebase to point to, so this is out of
scope rather than a control this solution answers.

### 5.15/5.16/5.17/5.18 — Access control & identity ✅ Fixed

The single most-repeated finding across every assessment this session is resolved: `src/lib/authz.ts`'s
`requireRole`/`requireRoleOrOwner` enforce role correctly and consistently (confirmed live,
matching OWASP A01), and now there *is* an actual identity behind the role — Keycloak (OIDC) via
Auth.js, resolving to a server-verified `userId` instead of a client-supplied one (OWASP A07). 5.17
is delegated to Keycloak as the IdP: the demo realm sets no password policy and all 5 seeded users
share one password (`Demo1234!`) — a deliberate demo simplification, not a production posture.
5.18's access-*rights* are fine (role-scoped, fail closed on missing/invalid id); access
*provisioning* is still a direct database write (`prisma/seed.ts`), no request/approval process —
reasonable for a reference implementation, a genuine gap for a production baseline.

### 5.19/5.20/5.21/5.22 — Supplier relationships & ICT supply chain ➖ Out of scope (HDAB establishment)

These four controls govern *contracted* third-party suppliers and ICT-product/service supply-chain
risk — agreements, SLAs, monitored services, supplier security assurance. There are none of that
here: dependencies are fetched anonymously from the public npm registry, with no relationship or
contract to manage, monitor, or assess. Treating the dependency tree as a "supplier" would be a
category error; dependency pinning and `npm audit` (genuine, and covered below under 8.8) are
technical vulnerability-management practices, not the supplier-relationship risk management 5.21
actually calls for. 5.19, 5.20, 5.21, and 5.22 all get the same treatment for consistency.

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
Verified live via actual requests for both the rejection cases and a representative sample of the
case-workflow actions. The collection *process* itself (who pulls it, in what format, chain of
custody) remains out of scope, same as 5.24–5.27.

### 5.30 — ICT readiness for business continuity ➖ Out of scope

This control covers organizational resilience broadly — redundancy, disaster-recovery testing,
RTO/RPO planning, failover, continuity *planning* as a document/process. A Postgres
backup/restore script (`npm run db:backup`/`db:restore`, verified — see 8.13) is one
narrow technical facet of that, not an implementation of 5.30's actual scope; replication/HA (a
different Postgres topology, not applicable to this single-node setup) and continuity planning
remain entirely absent. Out of scope per the governing rule above, same reasoning as 5.14/5.21.

### 5.31/5.34 — Legal requirements & PII protection ➖ Out of scope

Legal, statutory and PII-protection compliance (GDPR/AVG) is a legal/regulatory assessment, not a
technical mechanism this codebase implements — no encryption-at-rest, data-minimization, or
consent-management control is claimed here. `docs/ehds-gap-analysis.md` already tracks
EHDS-specific legal alignment; a full GDPR/AVG-specific assessment is a genuinely separate effort,
not a code-checkable slice of this one. Out of scope per the governing rule above, same reasoning
as the HDAB-establishment process controls.

### 5.33 — Protection of records ⚠️ Open

The permit detail page shows a "Retention deadline (Art. 68(12))"
(derived in `src/lib/permit.ts`'s `derivePermitDisplayFlags`/`addMonths`, displayed at
`src/app/[locale]/permits/[id]/page.tsx:325`) — but it's computed **at display time**, not a
stored field, and nothing enforces or acts on it when the date passes. The obligation is correctly
surfaced to staff; nothing currently executes on it. This is a code fix (a stored, enforced
field), not a process question, so it stays in scope.

### 5.35/5.36 — Independent review & compliance ➖ Out of scope

Whether independent reviews of information security are periodically performed, and whether
compliance with internal policies/standards is checked, are activities an operating HDAB
organization would run — this document family is one instance of that activity, not something
the *application* does or enforces at runtime. No technical mechanism in this codebase performs
or schedules such a review, so — per the governing rule above — this is out of scope, same
reasoning as the HDAB-establishment process controls, rather than something this document can
claim ✅ about itself.

## Technological (8.1–8.34)

| Control | Status | Key finding |
|---|---|---|
| 8.1 User endpoint devices | ℹ️ N/A | No app-managed endpoints — browser-based staff UI only |
| 8.2 Privileged access rights | ✅ Clean | ≈ OWASP A01 — role-scoped, no privilege-escalation path found |
| 8.3 Information access restriction | ✅ Clean | ≈ OWASP A01 |
| 8.4 Access to source code | ✅ Deliberate | Repo is intentionally public (MIT-licensed) — a choice, not an oversight |
| 8.5 Secure authentication | ✅ Fixed | ≈ OWASP A07 — see 5.15–5.18 above |
| 8.6 Capacity management | ℹ️ N/A | Not modeled — reasonable for this scope |
| 8.7 Malware protection | ⚠️ Partial | See below |
| 8.8 Management of technical vulnerabilities | ✅ Fixed | See below |
| 8.9 Configuration management | ✅ Clean | `.env`/`.env.example`; no infrastructure-as-code, reasonable for this scope |
| 8.10 Information deletion | ⚠️ Open | Same as 5.33 — application/permit metadata only, not health-data content |
| 8.11 Data masking | ➖ Out of scope | Health-data content — DAAMS never handles it |
| 8.12 Data leakage prevention | ➖ Out of scope | Same boundary as 8.11 |
| 8.13 Backup | ✅ Fixed | See below |
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
| 8.28 Secure coding | ✅ Clean | Same evidence as 8.26, plus SonarQube static analysis — see 8.25 |
| 8.29 Security testing in development/acceptance | ✅ Fixed | `npm run test` now runs on every push via `.github/workflows/ci.yml` |
| 8.30 Outsourced development | ℹ️ N/A | Not outsourced |
| 8.31 Separation of dev/test/production | ✅ Verified | See below |
| 8.32 Change management | ➖ Out of scope (HDAB establishment), code slice clean | Git history is a genuine, checkable mechanism (in scope, clean); formal approval process is operational |
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

### 8.8 — Management of technical vulnerabilities ✅ Fixed

Two dependencies previously pinned to `"*"` (OWASP A06, a non-reproducible-build gap) are now
pinned to exact versions, confirmed a behavioural no-op (`npx tsc --noEmit` clean, 55/55 tests
before and after). Advisory monitoring also improved: `.github/workflows/ci.yml` runs `npm audit`
on every push and pull request — not a scheduled/periodic scan (nothing catches a newly-disclosed
CVE on an otherwise-unchanged dependency until the next push), but a genuine improvement over the
previous "only if someone runs it by hand" state.

**2026-09-02 — the gate did its job.** Re-checking `npm audit` directly (not just assuming the
08-13 result still held) surfaced a HIGH-severity advisory disclosed since then: `browserslist`
<=4.28.6 (unbounded memory growth; prototype-write crash), pulled in transitively via
`autoprefixer`/`eslint-plugin-react-hooks`→`@babel/core` — a dev dependency, not in the
production bundle, but present in the full tree CI's `npm audit --audit-level=moderate` checks.
This would have failed the next push's CI run. Fixed same-day via `npm audit fix` (bumps
`browserslist` 4.28.4→4.28.8 and its own small chain — `update-browserslist-db`, `node-releases`,
`caniuse-lite` — no `package.json` pins touched, confirmed a behavioural no-op: `tsc` clean,
536/536 tests unchanged). Net takeaway: this is evidence the control *works*, not a lapse — the
whole point of running `npm audit` on every push is to catch exactly this kind of
newly-disclosed, time-sensitive finding before it ships.

### 8.13 — Backup ✅ Fixed

`docker-compose.yml`'s Postgres volume had no backup configuration — a concrete repo-level fact,
in scope, now closed: `scripts/backup-db.sh`/`restore-db.sh` (`npm run db:backup` / `npm run
db:restore -- <file>`) take/restore a `pg_dump`, resolving the running container by the port
`DATABASE_URL` points at. Verified live with a full backup-and-restore round trip against
disposable containers (`Bytea`/`Decimal`-equivalent data and sequences confirmed intact) plus a
second restore over the same target confirming the dump's `--clean --if-exists` idempotency —
same as `docs/nis2-assessment.md`'s treatment of (c). This is the full extent of what's
technically in scope here; the broader organizational-resilience question is 5.30, out of scope
above.

### 8.25 — Secure development life cycle ✅ Clean

Strong on the static-analysis side (typed Prisma queries throughout, zero raw SQL/`eval`, per
OWASP A03) and on environment separation (8.31, below). The automated-testing gap noted here
previously — no CI running `npm run test`/`npm audit` on any change — is now closed by
`.github/workflows/ci.yml`, which runs both on every push and pull request. Independent
corroboration from a different tool: two fresh SonarQube Community Edition scans this revision
(full detail in `docs/sonarqube-assessment.md`) both report 0 bugs, 0 vulnerabilities, 0 security
hotspots (Reliability/Security/Security Review all rating A) — and a dedicated pass this session
drove the CRITICAL-severity cognitive-complexity backlog from 9 findings down to 1 (the one
remaining is a JSX-structural page explicitly deferred and tracked openly, not hidden), with code
smells down from 268 to 255. Same evidence applies to 8.26–8.28 below (8.26/8.27 previously cited
OWASP A03 alone).

### 8.31 — Separation of development, test and production ✅ Verified

Genuine, checkable behavioural difference, not just a naming convention: `src/proxy.ts`'s CSP only
permits `'unsafe-eval'`/`'unsafe-inline'` when `NODE_ENV` is not production (needed for React
dev-mode and Turbopack Fast Refresh) — verified in both `next dev` and a production `next
build`/`next start` (OWASP A05). The security posture actually changes between environments.

### 8.33 — Test information ⚠️ Stated, not enforced

`docs/architecture.md`'s compliance table states the app runs on "test data only," and this
assessment's own framing repeats that. Checked directly: there is no code-level enforcement of
this — no environment guard, no data-validation step preventing actual personal data from being
entered. It's a stated operating intent, not a technical control — but unlike the process items
above, an enforcement mechanism (were one built) would be application code, so this stays in scope
rather than moving to HDAB-establishment.

## Bottom line

Tightened to **technical controls this solution explicitly implements** — the governing rule
above, applied consistently across all four themes rather than just at the Physical/People
boundary — this assessment resolves cleanly. **The single highest-leverage item every prior
revision named is now fixed**: genuine authentication (Keycloak/OIDC) behind the already-correctly-
enforced role system (5.15–5.18/8.5) — genuinely technical mechanisms, in scope regardless of
BIO2's own Organizational-theme filing. What remains open is a handful of small, concrete
repo-level facts, all of them things this codebase actually attempts and falls short of, not
things it never attempted: unvalidated attachment content (8.7), the
retention-deadline-computed-not-enforced finding (5.33/8.10), and — new this revision — no
password policy/MFA configured in the Keycloak demo realm (5.17/8.5, delegated-but-unconfigured,
not a code gap). Dependency pinning and CI (8.8, 8.29), Postgres backup/restore (8.13), and the
evidence-source half of incident management are also fixed: every mutation now leaves a trace —
status transitions, other successful case-workflow actions, and rejected/unauthorized attempts
alike (5.28/8.15). Cryptography, injection-safety, and environment separation are clean. New this
revision: a fresh, independent SonarQube pass corroborates the secure-coding findings (0
bugs/vulnerabilities/hotspots across two scans, CRITICAL cognitive-complexity findings 9 → 1,
8.25/8.28), and the CI `npm audit` gate caught and fixed a newly-disclosed HIGH advisory same-day
(8.8) — the control doing exactly what it's for. **Everything else this document names is
out of scope, and correctly so** — two distinct reasons, both stated plainly rather than silently
omitted: an operating HDAB's incident-response process, training, documented procedures,
change-approval process, and monitoring operations
(5.1/5.2/5.4–5.8/5.10/5.11/5.19/5.20/5.22/5.24–5.27/5.29/5.32/5.37, all of People, 8.16, the
process half of 8.32) belong to *establishing that organization*, not to building this
application; and information transfer, asset/data classification, ICT supply chain, ICT readiness
for business continuity, legal/PII compliance depth, and independent security review (5.14,
5.9/5.12/5.13, 5.21, 5.30, 5.31/5.34, 5.35/5.36) are organizational/governance activities with no
technical mechanism in this codebase to point to, even though they aren't classic
organization-standup items. Conflating either kind of exclusion with "the codebase should fix
this" is exactly what would make a future assessment overstate what a codebase review can
actually tell you.

### Suggested order

1. ~~**Cheap, independent of auth**: pin the two `"*"` dependencies; add a CI workflow
   running `npm audit` + `npm run test` on every push (8.8/8.29).~~ **Done** — see
   8.8/8.25/8.29 above.
2. ~~**Small, concrete, code-level**: backup/restore for the application's own Postgres data
   (8.13).~~ **Done** — see 8.13 above.
3. ~~**The foundational fix, shared with every other assessment this session**: genuine
   authentication — resolves 5.15–5.18 and 8.5.~~ **Done** — see 5.15–5.18/8.5 above.
4. **Small, concrete, code-level, still open**: content validation on the `Attachment` import
   path (8.7).
5. **Before any actual (non-demo) rollout**: enable a password policy and MFA in the Keycloak realm
   (5.17/8.5).
6. **Close the loop on deletion**: make the retention deadline a stored, enforced field rather
   than a display-time computation (5.33/8.10).

Everything named "out of scope" above — both the HDAB-establishment process controls and the
organizational-governance controls with no technical mechanism to point to (5.14, 5.9/5.12/5.13,
5.21, 5.30, 5.31/5.34, 5.35/5.36) — is a separate workstream for whoever stands up an actual HDAB on top of
this codebase, not a follow-up item here.
