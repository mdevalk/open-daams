# BIO2 assessment: open-daams

_Snapshot date: 2026-08-13._

This assesses the open-daams codebase against **BIO2**, the Dutch public sector's information
security baseline built on **ISO/IEC 27002:2022** — a structurally different control set from the
original BIO (which followed the older ISO 27001:2013 Annex A, 14-domain model). BIO2 organizes
its 93 controls into 4 themes: **Organizational** (5.1–5.37), **People** (6.1–6.8), **Physical**
(7.1–7.14), **Technological** (8.1–8.34). It complements `docs/owasp-top10-assessment.md` — most
Technological-theme findings reuse that assessment's evidence directly rather than re-deriving it.

> **Framing.** Same as the other assessments: test data only, authentication stubbed — written
> against the bar a real deployment would need to clear, not a certification or ENSIA attestation.
>
> **Scope boundary.** This assesses the **open-daams application only** — not a datacenter,
> hosting, or facilities context, which is a separate work package for DAAMS. The entire Physical
> theme is excluded on this basis, and several Technological controls are narrowed to their
> application-layer slice only. Separately: **DAAMS never handles the health data itself** — that
> happens at the data holder or the SPE, both outside this back-office application's boundary
> (per `CLAUDE.md`'s own scope note that data-holder extraction and the SPE are simulated shells).
> Controls that are really about protecting health-data *content* (masking, leakage prevention)
> are out of scope for that reason, distinct from the datacenter exclusion — both are stated
> plainly below, not silently omitted.

## Physical (7.1–7.14) — out of scope

All 14 controls in this theme (physical security perimeters, entry control, securing offices,
physical security monitoring, protection against environmental threats, working in secure areas,
clear desk/clear screen, equipment siting, security of assets off-premises, storage media,
supporting utilities, cabling security, equipment maintenance, secure disposal) are facility- or
equipment-scoped. None have an application-code analogue — this is a datacenter/hosting concern,
a separate work package for DAAMS. No per-control table; excluded wholesale.

## People (6.1–6.8) — out of scope

| Control | Status |
|---|---|
| 6.1 Screening | ℹ️ Organizational |
| 6.2 Terms and conditions of employment | ℹ️ Organizational |
| 6.3 Security awareness, education and training | ℹ️ Organizational |
| 6.4 Disciplinary process | ℹ️ Organizational |
| 6.5 Responsibilities after termination/change of employment | ℹ️ Organizational |
| 6.6 Confidentiality or non-disclosure agreements | ℹ️ Organizational |
| 6.7 Remote working | ℹ️ Organizational |
| 6.8 Information security event reporting | ℹ️ Organizational |

All eight concern the (fictional) organization's employees and HR processes — nothing here is
checkable against a codebase. Stated as a complete theme, not omitted.

## Organizational (5.1–5.37)

| Control | Status | Key finding |
|---|---|---|
| 5.1 Policies for information security | ℹ️ Organizational | No policy documents in the repo |
| 5.2 Information security roles and responsibilities | ℹ️ Organizational | No named role-owner (no real organization) |
| 5.3 Segregation of duties | ✅ Real | See below |
| 5.4 Management responsibilities | ℹ️ Organizational | — |
| 5.5 Contact with authorities | ℹ️ Organizational | — |
| 5.6 Contact with special interest groups | ℹ️ Organizational | — |
| 5.7 Threat intelligence | ℹ️ Organizational | No subscription/process — reasonable for this scope |
| 5.8 Information security in project management | ℹ️ Organizational | — |
| 5.9 Inventory of information and other assets | ⚠️ Open | No formal asset/data inventory |
| 5.10 Acceptable use of assets | ℹ️ Organizational | No organizational assets to govern |
| 5.11 Return of assets | ℹ️ Organizational | — |
| 5.12 Classification of information | ⚠️ Open | See below |
| 5.13 Labelling of information | ⚠️ Open | Follows from 5.12 — no classification, so nothing to label |
| 5.14 Information transfer | ✅ Clean | Reuses OWASP A10 — hardcoded outbound host, no user-controlled transfer target |
| 5.15 Access control | ⚠️ Open (root gap) | See below |
| 5.16 Identity management | ⚠️ Open (root gap) | See below |
| 5.17 Authentication information | ❌ N/A | No authentication exists, so there's no authentication information to manage |
| 5.18 Access rights | ✅ Partial | Role-based, correctly enforced; provisioning/de-provisioning is a direct DB write, no process |
| 5.19 Supplier relationships | ⚠️ Open | Two `"*"`-pinned dependencies |
| 5.20 Supplier agreements | ℹ️ Organizational | No suppliers with contracts — npm dependency tree only |
| 5.21 ICT supply chain | ⚠️ Open | Same as 5.19 |
| 5.22 Monitoring/review of supplier services | ⚠️ Open | No automated dependency-update or advisory monitoring |
| 5.23 Cloud services security | ℹ️ N/A | No cloud services used — self-hosted Postgres via `docker-compose.yml` |
| 5.24 Incident management planning | ⚠️ Open | See below |
| 5.25 Assessment/decision on security events | ⚠️ Open | No process — nothing is classified as an "event" today |
| 5.26 Response to incidents | ⚠️ Open | No response procedure |
| 5.27 Learning from incidents | ⚠️ Open | No incident record to learn from |
| 5.28 Collection of evidence | ⚠️ Open | Logging exists for successes only (see A09) |
| 5.29 Security during disruption | ℹ️ Organizational | — |
| 5.30 ICT readiness for business continuity | ⚠️ Open | No backup/DR config, no continuity plan |
| 5.31 Legal, statutory, regulatory, contractual requirements | ✅ Partial | See below |
| 5.32 Intellectual property rights | ℹ️ Organizational | — |
| 5.33 Protection of records | ⚠️ Open | See below |
| 5.34 Privacy and protection of PII | ✅ Partial | See below |
| 5.35 Independent review of information security | ✅ Clean | This document family *is* that review |
| 5.36 Compliance with policies/standards | ✅ Clean | Same as 5.35 |
| 5.37 Documented operating procedures | ⚠️ Open | No operational runbooks exist — `docs/` covers architecture/compliance, not day-2 operations |

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
classification scheme, even a simple one.

### 5.15/5.16/5.17/5.18 — Access control & identity ⚠️ Open (root gap)

The single most-repeated finding across every assessment this session: `src/lib/authz.ts`'s
`requireRole`/`requireRoleOrOwner` enforce role correctly and consistently (confirmed live,
matching OWASP A01) — but there is no identity behind the role. A client-supplied `userId` is
trusted outright (OWASP A07). 5.17 doesn't even apply in the usual sense — there's no
authentication information (password, token, credential) to protect, because there's no
authentication step at all. 5.18's access-*rights* are fine (role-scoped, fail closed on
missing/invalid id); access *provisioning* is a direct database write, no request/approval
process — reasonable for a reference implementation, a real gap for a production baseline.

### 5.19/5.21/5.22 — Supplier & ICT supply chain ⚠️ Open

`@rijkshuisstijl-community/components-react` and `@rijkshuisstijl-community/design-tokens` remain
pinned to `"*"` (OWASP A06) — non-reproducible builds, auto-pulls any future publish. No automated
dependency-advisory monitoring exists (no CI, no Dependabot-equivalent configuration found).

### 5.24–5.28 — Incident management ⚠️ Open

Real progress exists on the *recording* side — `ApplicationLog`, `DataPermitLog`,
`SpeProvisioningLog`, and a separate `AuditLog` for reference-data CRUD (OWASP A09) — but nothing
above that: no process classifies a logged event as a security incident, no response procedure,
no post-incident review step, and — the OWASP A09 finding restated in BIO2's terms — only
*successful* actions are recorded, so a pattern of rejected/unauthorized attempts leaves no trace
to even trigger 5.25's assessment step.

### 5.30 — ICT readiness for business continuity ⚠️ Open

`docker-compose.yml`'s Postgres volume has no backup or replication configuration. No continuity
plan of any kind exists, documented or otherwise.

### 5.31/5.34 — Legal requirements & PII protection ✅ Partial

Scoped to the applicant/contact PII DAAMS actually stores — names, emails, organisations on
`Application` — not health-data content (out of scope per this document's framing, same boundary
as 8.11/8.12 below). `docs/ehds-gap-analysis.md` already tracks EHDS-specific legal alignment; a
full GDPR/AVG-specific assessment was scoped for a separate effort and isn't repeated here.

### 5.33 — Protection of records ⚠️ Open

The permit detail page shows a "Retention deadline (Art. 68(12))"
(`src/app/[locale]/permits/[id]/page.tsx:164`) — but it's `addMonths(permit.validUntil, 6)`,
computed **at display time**, not a stored field, and nothing enforces or acts on it when the date
passes. The obligation is correctly surfaced to staff; nothing currently executes on it.

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
| 8.8 Management of technical vulnerabilities | ⚠️ Open | `npm audit` clean, but nothing runs it automatically — no CI exists |
| 8.9 Configuration management | ✅ Clean | `.env`/`.env.example`; no infrastructure-as-code, reasonable for this scope |
| 8.10 Information deletion | ⚠️ Open | Same as 5.33 — application/permit metadata only, not health-data content |
| 8.11 Data masking | ➖ Out of scope | Health-data content — DAAMS never handles it (WP5 boundary) |
| 8.12 Data leakage prevention | ➖ Out of scope | Same boundary as 8.11 |
| 8.13 Backup | ⚠️ Open | No backup configuration found |
| 8.14 Redundancy | ➖ Out of scope | Infrastructure/datacenter concern |
| 8.15 Logging | ✅ Real, partial | ≈ OWASP A09 — successes only |
| 8.16 Monitoring activities | ⚠️ Open | Nothing acts on what's logged — no alerting |
| 8.17 Clock synchronization | ℹ️ N/A | — |
| 8.18 Use of privileged utility programs | ℹ️ N/A | — |
| 8.19 Installation of software on operational systems | ℹ️ N/A | Deployment concern |
| 8.20 Networks security | ✅ Partial | Application-layer slice only — CSP headers (`src/proxy.ts`, OWASP A05); true network topology out of scope |
| 8.21 Security of network services | ✅ Partial | Hardcoded outbound host (OWASP A10) |
| 8.22 Segregation of networks | ➖ Out of scope | Infrastructure/datacenter concern |
| 8.23 Web filtering | ℹ️ N/A | — |
| 8.24 Use of cryptography | ✅ Clean | ≈ OWASP A02 |
| 8.25 Secure development life cycle | ✅ Partial | See below |
| 8.26 Application security requirements | ✅ Clean | ≈ OWASP A03 — typed queries, no injection surface |
| 8.27 Secure system architecture and engineering | ✅ Clean | Same evidence as 8.26 |
| 8.28 Secure coding | ✅ Clean | Same evidence as 8.26 |
| 8.29 Security testing in development/acceptance | ⚠️ Open | `npm run test` exists and passes, nothing runs it automatically |
| 8.30 Outsourced development | ℹ️ N/A | Not outsourced |
| 8.31 Separation of dev/test/production | ✅ Real | See below |
| 8.32 Change management | ✅ Partial | Git history is the de facto record; no formal documented process beyond that |
| 8.33 Test information | ⚠️ Stated, not enforced | See below |
| 8.34 Protection of systems during audit testing | ℹ️ N/A | No audit-testing infrastructure exists |

### 8.7 — Malware protection ⚠️ Partial

`Attachment` (`prisma/schema.prisma:643-656`) stores raw file `content: Bytes` with a
self-reported `mimeType` — no content validation or scanning. The only writer is the NCP import
path (`src/app/api/import/ncp-applications/[id]/attachments/[filename]/route.ts`), extracting from
a ZIP archive — there's no user-facing upload endpoint accepting arbitrary files today, which
narrows the practical surface, but doesn't close the underlying gap: nothing would catch a
malicious file arriving via that import path either.

### 8.25 — Secure development life cycle ✅ Partial

Strong on the static-analysis side (typed Prisma queries throughout, zero raw SQL/`eval`, per
OWASP A03) and on environment separation (8.31, below) — weak on the automated-testing side: no CI
runs `npm run test` or `npm audit` on any change, so both exist as manual, easily-skipped steps
rather than an enforced gate.

### 8.31 — Separation of development, test and production ✅ Real

Genuine, checkable behavioural difference, not just a naming convention: `src/proxy.ts`'s CSP only
permits `'unsafe-eval'`/`'unsafe-inline'` when `NODE_ENV` is not production (needed for React
dev-mode and Turbopack Fast Refresh) — verified in both `next dev` and a production `next
build`/`next start` (OWASP A05). The security posture actually changes between environments.

### 8.33 — Test information ⚠️ Stated, not enforced

`docs/architecture.md`'s compliance table states the app runs on "test data only," and this
assessment's own framing repeats that. Checked directly: there is no code-level enforcement of
this — no environment guard, no data-validation step preventing real personal data from being
entered. It's a stated operating intent, not a technical control.

## Bottom line

The Technological theme's picture closely mirrors the OWASP assessment, because it's largely the
same underlying facts read through BIO2's finer-grained lens — access control and cryptography are
genuinely clean, secure coding practices are consistently applied, and the one recurring root gap
(no real authentication) surfaces across 5.15–5.18 and 8.5 alike. What BIO2's structure adds that
OWASP's scope didn't cover: **information deletion is recorded as an obligation but never
enforced** (5.33/8.10), **there is no automated CI gate at all** for either vulnerability scanning
or the existing test suite (8.8/8.29), and **incident management stops at logging** — nothing
downstream classifies, responds to, or learns from what's recorded (5.24–5.28/8.16). The two
controls most people would expect to be gaps for a health-data system — data masking and leakage
prevention (8.11/8.12) — are correctly out of scope, because DAAMS's back-office role means it
never holds the health data those controls are about.

### Suggested order

1. **Cheap, independent of auth**: pin the two `"*"` dependencies (5.19/5.21); add a CI workflow
   running `npm audit` + `npm run test` on every push (8.8/8.29) — currently zero automation
   exists for either.
2. **Write down what already exists as policy**: a data-classification note (5.12), a short
   backup/continuity plan (5.30/8.13), and an operating-procedures doc (5.37) — the technical
   facts already exist in this and the OWASP assessment; what's missing is the document.
3. **The real fix, shared with every other assessment this session**: real authentication —
   resolves 5.15–5.18 and 8.5.
4. **Close the loop on deletion**: make the retention deadline a stored, enforced field rather
   than a display-time computation (5.33/8.10).
5. **Build the process layer**: incident classification/response procedure beyond logging
   (5.24–5.28/8.16) — genuinely new work, not a code fix.
