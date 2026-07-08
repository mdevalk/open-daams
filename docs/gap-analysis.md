# Gap analysis: open-daams vs EHDS & TEHDAS2

_Snapshot date: 2026-07-08._

This document compares the functionality **actually modelled and wired** in open-daams
against what the **EHDS Regulation (EU) 2025/327 (Chapter IV, secondary use)** and the
**TEHDAS2 D6.x deliverables** prescribe for a national Health Data Access Body (HDAB) and
its Data Access Application Management System (DAAMS).

It is derived from the Prisma schema (`prisma/schema.prisma`), the API route structure
(`src/app/api/**`), and the domain-logic modules (`src/lib/**`) — i.e. what is built, not
what the README aspires to.

> **Caveats.** (1) "Present" reflects what is modelled and wired, not a guarantee that every
> state transition is bug-free. (2) This is an unofficial community project; nothing here is
> compliance advice.

## Verdict

The project covers the core **application → assessment → decision → permit → invoice** spine
thoroughly and honestly; the schema is unusually faithful to the D6.3/D6.4 field definitions.
It falls short of the Regulation in two predictable places:

1. **Everything requiring an external integration** — real Secure Processing Environment,
   real data-holder extraction, real HealthData@EU node — exists only as a tracking shell
   (state machine), not as a working integration.
2. **The "ecosystem" obligations** an HDAB has beyond processing a single application —
   dataset discovery, cross-HDAB recognition, ongoing monitoring, and periodic reporting.

## What's actually built — and how deeply

| Function | Prescribed by | In the project | Depth |
|---|---|---|---|
| Two application types (data access application + data request) | EHDS Art. 67 / 69; D6.3 Annex 5/6 | `ApplicationType`, full distinct field sets | **Strong** — fields mirror the annexes (cohort formation, tabulation plan, controls/relatives, transfers outside EU/EEA, GDPR 6(1) grounds) |
| Application lifecycle + statutory deadlines | EHDS Art. 68(4)/69(4); D6.4 §7.6–8 | `ApplicationStatus` + deadline fields, void/recalc on info requests | **Strong** |
| Completeness check (distinct from assessment) | D6.3 Ch. 5, Annex 7/8 | `CompletenessCheck` model | **Strong** |
| Ethical review tracking | D6.3 §6.1 | `EthicalReviewStatus` + fields | Present (tracking) |
| Cost estimate → applicant acceptance | EHDS Art. 62(5); D6.3 §6.5 | `FeeEstimate` | **Strong** |
| Decision + permit issuance, 10-section permit doc | EHDS Art. 68; D6.3 Annex 9 | `DataPermit` + `generate-permit-pdf.ts` (real PDF) | **Strong** |
| Permit lifecycle (amend / renew-once / revoke / expire) | EHDS Art. 68(12), 63(1); D6.4 §9.2 | `DataPermitStatus` + `DataPermitLog` | **Strong** |
| Invoicing (provisional + final) | EHDS Art. 62; D6.3 Ch. 8 | `Invoice` | **Strong** |
| Authorized persons in the SPE | EHDS Art. 73; Annex 9 §6.8 | `AuthorizedPerson` | Present (list only) |
| Appeals (bezwaar/beroep) | EHDS Art. 63 / national law | `Appeal` | Present |
| Public transparency register | EHDS Art. 57(1)(j)(ii), 58, 61(4) | `publishedAt` / `decisionPublishedAt` + public route | Present |
| Opt-out exception | EHDS Art. 71(4) | flag + justification field | Present (flag only) |
| Immutable audit trail | supports Art. 57(1) record-keeping | `AuditLog`, `DataPermitLog`, `SpeProvisioningLog` | **Strong** |

## Present-but-simulated (shell exists, no real integration)

Modelled as state machines, but they do not perform the real-world action. Important to be
explicit about for a compliance-themed demo.

| Function | Ref | Reality in code |
|---|---|---|
| **Secure Processing Environment** | Art. 73 | `SpeProvisioningOrder` tracks `REQUESTED → ACTIVE → DECOMMISSIONED` status only. No actual environment, no in-SPE access logging, no "data cannot leave" enforcement — which is the substance of Art. 73. |
| **Data extraction from health data holders** | Art. 60, 68(7) | `DataExtractionRequest` tracks `REQUESTED → DELIVERED`. No real data-holder connection or data movement. |
| **HealthData@EU cross-border** | Art. 75 | `hdeu.ts` + `ncp-mock.ts` — a fixed mock queue; no real National Contact Point node. |
| **Anonymisation / pseudonymisation** | Art. 64 | Exists only as a fee line item (`dataPreparationFee`); no actual data transformation. |

## Genuine gaps — prescribed, but absent

| Prescribed function | Ref | Status |
|---|---|---|
| **Dataset metadata catalogue** (users discover/browse datasets before applying) | Art. 77–80 | **Absent** — arguably the biggest functional gap; no dataset/holder inventory exists, so the "discover data → apply" front half of the EHDS journey is missing |
| **Data quality & utility labelling** of datasets | D6.1 framework | **Absent** |
| **Trusted data holder** procedure | Art. 72 | **Absent** |
| **Mutual recognition** of another HDAB's permit | Art. 68(5) | **Absent** |
| **Compliance monitoring** during permit validity | Art. 57(1)(a)(ii) | **Absent** (revocation exists, but nothing monitors for the conditions that would trigger it) |
| **Results-publication tracking** (data user must publish findings) | Art. 61(4) | **Absent** |
| **Periodic HDAB activity report** | Art. 59 | **Absent** |
| **IPR / trade-secret contractual safeguards** | Art. 52, Annex 11 | **Absent** |
| **In-SPE user-activity logging** | Art. 73(e) | **Absent** |
| **Applicant identity / qualification verification** | Art. 67 | Form captures it; no verification step |

## Cross-cutting / correctness flags

1. **No real authentication.** `src/lib/authz.ts` trusts a client-supplied `userId`. This is
   not only a deployment concern: Art. 57 assumes the HDAB controls who does what, so the RBAC
   is presentational until real identity is added. `authz.ts` is the single centralization
   point where real auth would slot in.

2. **Article-number citations — FIXED (2026-07-08).** The UI previously carried leftover
   draft-proposal numbering: `Art. 46` for the data access application / decision deadline
   and `Art. 34` for the purpose. These were corrected to the final Regulation (EU) 2025/327
   numbering — **Art. 67** (health data access applications), **Art. 68** (data permit /
   decision deadline), **Art. 69** (health data request), **Art. 53** (purposes for secondary
   use) — across the message files, the new-application form, the footer, and this doc's
   architecture companion. The permit PDF generator already used the correct numbering. A
   repo-wide scan confirms no `Art. 34`/`Art. 46` references remain.

3. **Decision-deadline *duration* is still proposal-era.** Distinct from the citation fix
   above: the app models a **2-month** deadline extendable to **4 months** (`workflow.ts`,
   `architecture.md`, README, HD@EU import copy). Under the final Art. 68 the general deadline
   is **3 months (+3)**, with **2 months (+1)** being only the *accelerated* track for
   public-sector bodies. Changing this alters the deadline date-math, so it is left as a
   deliberate open item, not a citation typo.

4. **Purpose taxonomy is inconsistent across files.** The new-application form and
   `src/lib/utils.ts` use the value set `{SCIENTIFIC_RESEARCH, PUBLIC_HEALTH, POLICY_MAKING,
   EDUCATION_TRAINING, HEALTHCARE_DELIVERY, PERSONALISED_MEDICINE}`, while the permit PDF
   generator (`generate-permit-pdf.ts`) expects `{…, STATISTICS, EDUCATION, CARE_IMPROVEMENT}`.
   For the three mismatched values the PDF silently falls back to the raw enum string instead
   of an Art. 53(1) label. Worth reconciling to one canonical set aligned with Art. 53(1).

5. **`Document` is a metadata stub.** The model stores `filename`/`mimeType`/`sizeBytes` but
   there is no upload/storage route wired, so attachment handling is not real yet.

## Suggested priorities

For a demo meant to illustrate the DAAMS concept, the highest-value additions are:

1. **Dataset metadata catalogue (Art. 77–80)** — restores the missing front half of the EHDS
   journey (discover data → apply).
2. **Align the decision-deadline duration with the final Art. 68** (flag 3 above) — the
   article citations are now correct, but the underlying 2-month/4-month timing is not.

The simulated integrations (SPE, extraction, NCP) are reasonable to leave as shells, since no
real counterparties exist to integrate with in a demo context.
