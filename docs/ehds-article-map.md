# EHDS article map — DAAMS-relevant articles

_Snapshot date: 2026-07-14._

This maps the articles of the **EHDS Regulation (EU) 2025/327** (Chapter IV — secondary use)
that are relevant to a **DAAMS** (Data Access Application Management System) to their
implementation status in open-daams.

Scope follows the D6.4 definition of a DAAMS — the component responsible for the *submission and
processing of data access applications and data requests* (plus decision, permit, deadlines,
appeals/enforcement, mutual recognition, trusted data holders, and cross-border reception).
Broader EHDS components — the dataset catalogue and data-quality labelling (Art. 77–80) and
purely institutional articles — are listed separately as out of DAAMS scope.

> Article titles were verified against the EHDS EN text (via streamlex) in this session.
> Implementation status reflects the codebase as read, not a guarantee that every path is
> bug-free. This is an unofficial community project; nothing here is compliance advice, and the
> authoritative text is the consolidated Official Journal version on EUR-Lex.

## Legend

- ✅ **Implemented** — functional in the app
- ◑ **Partial / simulated** — modelled or tracked, but incomplete or without a real integration
- ✗ **Not implemented** — absent (at most a placeholder)

## DAAMS-relevant articles

| Art. | Title | Impl. | Notes |
|---|---|:---:|---|
| 52 | Intellectual property rights and trade secrets | ✗ | placeholder only in the permit PDF |
| 53 | Purposes for which electronic health data can be processed for secondary use | ✅ | `purposeCategory` on the application |
| 57 | Tasks of health data access bodies | ◑ | workflow + audit trail present; RBAC has no real authentication |
| 58 | Obligations of health data access bodies towards natural persons | ◑ | public register yes; broader information duties no |
| 60 | Duties of health data holders | ◑ | `DataExtractionRequest` tracking; data holder simulated |
| 61 | Duties of health data users | ◑ | stated in the permit; not tracked or enforced |
| 62 | Fees | ✅ | `FeeEstimate` + `Invoice` (provisional + final) |
| 63 | Enforcement by health data access bodies | ◑ | revocation + appeals tracked; no ongoing compliance monitoring |
| 67 | Health data access applications | ✅ | intake, form, full application lifecycle |
| 68 | Data permit | ✅ | `DataPermit` + lifecycle + decision deadline (tracks) + PDF |
| 69 | Health data request | ✅ | request type + tabulation plan |
| 71 | Right to opt out from the processing of personal electronic health data for secondary use | ◑ | flag + justification; no opt-out register integration |
| 72 | Simplified procedure for access to electronic health data from a trusted health data holder | ✗ | placeholders; D6.4 §12 not implemented |
| 73 | Secure processing environment | ◑ | provisioning status tracked; no real SPE / in-SPE logging |
| 75 | HealthData@EU | ◑ | import via a mock NCP queue; no real NCP |
| 76 | Access to cross-border registries or databases of electronic health data for secondary use | ✗ | permit-PDF note only |

**Summary:** ✅ 5 implemented (53, 62, 67, 68, 69) · ◑ 8 partial/simulated (57, 58, 60, 61, 63,
71, 73, 75) · ✗ 3 not implemented (52, 72, 76).

Pattern: the core workflow (application → decision → permit → fees) is complete; everything that
requires an external integration (SPE, data-holder extraction, NCP) is simulated; the standalone
safeguards (IPR, trusted-data-holder procedure, cross-border registries) are absent.

## Out of DAAMS scope (adjacent EHDS components)

| Art. | Title | Why outside DAAMS |
|---|---|---|
| 51 | Minimum categories of electronic health data for secondary use | data-holder / supply side |
| 55 | Health data access bodies | institutional (establishment of the HDAB) |
| 59 | Reporting by health data access bodies | institutional reporting |
| 77 | Dataset description and dataset catalogue | separate data-discovery component |
| 78 | Data quality and utility label | metadata/quality, separate component |
| 79 | EU dataset catalogue | EU infrastructure, separate |
| 80 | Minimum specifications for datasets of high impact | dataset specification, separate |

Note: the dataset catalogue (Art. 77–80) is the biggest *functional* gap for the wider
"discover → apply" journey (see [`gap-analysis.md`](./gap-analysis.md)), but as a system it is
distinct from the DAAMS itself. Art. 52 and 61 are borderline — they are permit content rather
than DAAMS process — and could be moved into the in-scope table if preferred.
