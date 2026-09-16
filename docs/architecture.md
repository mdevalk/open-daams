# HDAB-NL DAAMS — Prototype architecture

_Snapshot date: 2026-08-07. Translated to English and updated from the previous Dutch version._

## Where this project fits

This prototype implements the TEHDAS2 D6.4 state machine and the EHDS workflow as defined by
the European Commission. It is **not** a competitor to the official national DAAMS that VWS,
RIVM, CBS, ICTU, and Health-RI are jointly building; it serves a different purpose:

| Use | Explanation |
|---|---|
| **Reference implementation** | A verifiable translation of D6.4 into working code |
| **Data holder preparation** | Hospitals, cohorts, and registries can practise the EHDS workflow before the official DAAMS exists |
| **NCP integration testing** | The HD@EU import section talks to the real National Dispatcher OpenAPI on the HDAB-NL test environment when configured, falling back to fixture data otherwise |
| **Learning platform** | HDAB-NL staff can practise roles and deadlines in a safe environment |

---

## Component diagram (data holder preparation)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Data holder                              │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  Applicant   │    │  HDAB-NL     │    │  Secure           │  │
│  │  portal      │───▶│  DAAMS       │───▶│  Processing       │  │
│  │  (Next.js)   │    │  (this tool) │    │  Environment (SPE)│  │
│  └──────────────┘    └──────┬───────┘    └──────────────────┘  │
│                             │                                   │
│                             │ NCP channel (REST/FHIR)           │
│                             ▼                                   │
│                    ┌──────────────────┐                        │
│                    │  HD@EU import    │ ◀── Foreign HDAB       │
│                    │  endpoint        │     (via NCP)          │
│                    └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

**Important (D6.4 §14):** DAAMS NEVER communicates directly with the HealthData@EU Central
Platform. All cross-border requests flow through the National Contact Point (NCP).

---

## Compliance boundaries of this prototype

| Requirement | Status in prototype | Required for production |
|---|---|---|
| **GDPR** | No real personal data — test data only | Data processing agreement, DPIA, register of processing activities |
| **NEN 7510 / ISO 27001** | Out of scope | Full ISMS, certified hosting |
| **EHDS Art. 53/67/68/69** | Workflow follows D6.4; no legal validity | Formal designation as HDAB by the Ministry of Health |
| **WCAG 2.1 AA** | NL Design System tokens present; full audit still required | Accessibility audit by a certified party |
| **Logging & audit trail** | Multiple append-only log tables (`ApplicationLog`, `DataPermitLog`, `SpeProvisioningLog` for status transitions; a separate `AuditLog` for reference-data changes) — see [`docs/owasp-top10-assessment.md`](./owasp-top10-assessment.md) for exactly what is and isn't covered | Tamper-evident storage (e.g. WORM), and logging of rejected/unauthorised attempts, not just successes |
| **Key management** | `.env` file / local key file | HSM or KMS (e.g. Azure Key Vault) |

---

## State machine (TEHDAS2 D6.4 Figures 1 & 2)

Both application types (`DATA_ACCESS_APPLICATION` and `DATA_REQUEST`) use the same state
machine:

```
DRAFT
  │
  ▼ [APPLICANT: submit]
SUBMITTED
  │
  ▼ [CASE_HANDLER: start pre-screening]
PRE_SCREENING ◀──────────────────────────────┐
  │                                          │
  ├─▶ [CASE_HANDLER] AWAITING_ADDITIONAL_   │
  │                  INFORMATION            │
  │                    │                    │
  │                    ├─▶ [APPLICANT /     │
  │                    │    CASE_HANDLER]   │
  │                    │    Info submitted ─┘
  │                    │
  │                    └─▶ [DECISION_MAKER] DECISION_ISSUED (NEGATIVE)
  │                            (no response within the deadline)
  │
  ▼ [CASE_HANDLER: complete]
PROCESSING
  │
  ├─▶ [DECISION_MAKER] DECISION_ISSUED (POSITIVE)
  │       │
  │       └─▶ Create DataPermit (D6.4 §9.3)
  │               │
  │               ├─▶ GRANTED → AMENDED (new permit ID)
  │               ├─▶ GRANTED → RENEWED (new permit ID; cannot repeat)
  │               ├─▶ GRANTED → REVOKED
  │               └─▶ GRANTED → EXPIRED
  │
  └─▶ [DECISION_MAKER] DECISION_ISSUED (NEGATIVE)

WITHDRAWN  ◀── from any active stage
```

### Deadlines (D6.4 §8)

- **Decision deadline** (EHDS Art. 68): standard track 3 months after a complete application
  (extendable by 3), or accelerated track 2 months for public bodies/EU institutions
  (extendable by 1)
- **Suspension**: the deadline is set to `null` on transition to `AWAITING_ADDITIONAL_INFORMATION`
- **Recalculation**: the deadline restarts from `additionalInfoReceivedAt` on return to
  `PRE_SCREENING`
- **Additional-information deadline**: 28 days from the request

---

## Cross-border applications (HD@EU via NCP)

Applications from foreign researchers arrive via the NCP channel:

1. The foreign HDAB sends a payload to `/api/import/hdeu`
2. Deduplication on `hdeuApplicationId` (409 on a duplicate)
3. The application is created in `SUBMITTED` status
4. The statutory deadline starts from the `transmissionTimestamp` in the payload
5. The rest of the workflow is identical to national applications

See `docs/hdeu-payload-sample.md` for a sample payload.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.3 (App Router, Turbopack), React 19.2, TypeScript |
| Internationalisation | next-intl (nl/en/fr UI; permit content and the issued PDF stay in the issuing HDAB's language) |
| Styling | NL Design System (Rijkshuisstijl Community), Tailwind CSS |
| ORM | Prisma |
| Database | PostgreSQL |
| Testing | Vitest (unit tests for the pure `src/lib/` logic) |
| Authentication | Keycloak (OIDC), JWT sessions — real login for the seeded demo identities; production requires DigiD/eHerkenning |

---

## Capability-driven code, use-case-centric testing

Two concerns are deliberately kept separate here, with different homes and different owners:

**Capability organizes the code.** `src/lib/capabilities/<name>/` (e.g. `permit-lifecycle/`) is
where business-orchestration logic extracted out of API route handlers lives — a capability is a
durable statement of what the business needs to be able to do, stable across D6.4 revisions. A use
case implementation is a plain file directly inside its capability folder (e.g.
`checklist-checks.ts`) — a plain function (no `NextRequest`/`NextResponse` in its signature) taking
typed params and returning a typed `{ ok: true, data } | { ok: false, status, error }` result.
Route handlers become thin translators: parse the request, call the use case, map the result to
HTTP. This makes the orchestration directly unit-testable (no HTTP mocking) and separates it from
route wiring, which only needs its own test where the HTTP contract itself is at risk.

**Use case organizes testing and requirement-traceability**, in [`use-cases/`](../use-cases) — a
directory at the repo root, outside `src/`, because it's backlog/planning data, not application
code (nothing in `src/app`/`src/components` ever imports it — only the standalone
`scripts/requirements-coverage.ts` does). It's one flat, central list, not split per capability:

- [`use-cases/capabilities.ts`](../use-cases/capabilities.ts) — the capability id/name/description
  reference data.
- [`use-cases/registry.ts`](../use-cases/registry.ts) — **the** backlog: every identified use case,
  **whether or not it's been built yet**, each carrying a `capability` tag, the D6.4 `Rx.x.x`
  requirement IDs it satisfies (`satisfies`, filled in once actually implemented), and a `module`
  pointer (relative to its capability folder under `src/lib/capabilities/`) that's `null` until
  extracted. Adding a newly identified use case means adding a row here first, not writing code
  first.

A **use case stays the atomic, testable, requirement-tagged unit** — capability groups several of
them, it doesn't replace the granularity: `permit-lifecycle` alone bundles six operations
(issue/amend/renew/activate/revoke/provision-SPE) with no shared code. The registry doesn't need to
mirror the code's folder structure to stay in sync with it: a use case's `capability` tag is used
to *resolve* its `module` path (`src/lib/capabilities/<capability>/<module>`), so a wrong tag isn't
silently invisible — the coverage script simply fails to find the file there and reports **not
started** instead of **verified**. Cross-capability support, if a use case ever genuinely needs it
(none of the ~27 identified so far do — the one apparent case, permit revocation-appeal, resolved to
a single owning capability, `permit-lifecycle`, not `appeals`), is a one-line change to `capability:
string | string[]`, not a folder-placement question.

`npm run requirements:coverage` reads the registry and (re)writes
[`docs/use-case-coverage.md`](./use-case-coverage.md) — generated, not hand-maintained — reporting,
per use case, one of **not started** / **implemented, untested** / **verified** (module resolves +
a sibling `<module>.test.ts` exists), grouped by capability — plus a pivot by requirement ID. This
is *verification* coverage (is there a test that would fail if the behavior broke), distinct from
the traceability doc's own ✅/◑/✗/⏳/— *implementation* status, which stays a human judgment call the
script doesn't touch.

---

## Roadmap towards production

1. **Authentication**: ~~DigiD for applicants, eHerkenning for organisations, SAML/OIDC for HDAB
   staff — still the single biggest gap~~ — **partially done**: real OIDC login via Keycloak
   (`src/auth.ts`, self-provisioned realm in `keycloak/realm-export.json`) replaces the former
   client-supplied `userId`; every page now requires a session except the public register
   (`src/proxy.ts`). An ADMIN can "Act as" any seeded user for demo/support purposes, gated by a
   real role check re-validated server-side on every switch. Still missing for production:
   DigiD for applicants and eHerkenning for organisations — Keycloak currently authenticates the
   same closed set of seeded demo identities uniformly, not real citizen/business identity
   providers.
2. **Authorisation**: ~~case-level RBAC (an applicant only sees their own applications)~~ —
   **done**: several previously fully-open routes (application detail, attachments,
   decision-card PDFs, the internal permit record) require a staff role *or* ownership of the
   specific record (`requireRoleOrOwner`), and the claimed identity is now backed by a real
   Keycloak session rather than a client-supplied value (see item 1).
3. **Notifications**: email/MijnOverheid on status changes.
4. **Document management**: attachment storage with real byte content already exists (populated
   from NCP imports); an applicant-facing upload UI is out of DAAMS scope (front office/WP6, per
   `d6.4-gap-analysis.md` §6).
5. **Audit trail export**: for supervisory authorities (Autoriteit Persoonsgegevens) — not yet
   built; the underlying log tables exist, an export/reporting view does not.
6. **NCP integration**: **partially done** — the app calls the real National Dispatcher OpenAPI
   on the HDAB-NL test environment when `NCP_API_KEY` is configured; still missing retry/logging
   of failed exchanges and a formal interoperability test suite (D6.4 R14.0.4/14.0.5).
