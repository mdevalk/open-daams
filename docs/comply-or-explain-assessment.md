# Comply-or-explain (open standards) assessment: open-daams

_Snapshot date: 2026-08-13._

This assesses the open-daams codebase against Forum Standaardisatie's **"pas toe of leg uit"**
(comply-or-explain) list — the Dutch government's open-standards policy instrument: use a
standard on the list, or explicitly explain why not. It complements
`docs/wcag-2.1-assessment.md` and `docs/owasp-top10-assessment.md` — accessibility and
transport-security standards are already fully assessed there and aren't repeated here.

> **Framing.** Same as the other assessments: test data only, written against the bar a real
> deployment would need to clear, not a certification.
>
> **Scope boundary — same principle as `docs/bio2-assessment.md`/`docs/nis2-assessment.md`**:
> application code only. Network-layer standards on the list (IPv6, DNSSEC) are datacenter/hosting
> concerns, out of scope on that basis, same as those docs' Physical-theme exclusion.

## Summary

| Standard / category | Status | Key finding |
|---|---|---|
| PDF/A (document format) | ⚠️ Open | Permits are generated as plain PDF, not the archival PDF/A format |
| API standards (OpenAPI) | ⚠️ Open | No machine-readable spec exists for open-daams's own REST API |
| Accessibility (EN 301 549 / WCAG) | ➖ Cross-reference | Fully assessed in `docs/wcag-2.1-assessment.md` |
| TLS / transport security | ➖ Cross-reference | Covered by `docs/owasp-top10-assessment.md` A05 (CSP/HSTS) |
| Federated identity (SAML/OIDC) | ➖ Cross-reference | Tied to the root authentication gap (OWASP A07) — OIDC is already the named remediation there |
| Email security (DKIM/DMARC/SPF) | ℹ️ N/A | No email-sending exists in the codebase |
| ODF (OpenDocument Format) | ℹ️ N/A | DAAMS generates no office documents of its own |
| Network layer (IPv6, DNSSEC) | ➖ Out of scope | Datacenter/hosting concern |

## Findings

### PDF/A ⚠️ Open

`src/lib/generate-permit-pdf.ts` builds the issued permit via plain `pdf-lib`
(`PDFDocument.create()`) — a generic PDF, not **PDF/A**, the list's archival-format standard.
This matters more than a typical PDF output would: a granted permit is a legal document with a
genuine long-term-validity expectation (the same reason `docs/architecture.md`'s compliance table
already tracks a retention deadline for it, and `docs/bio2-assessment.md`'s 5.33/8.10 finding is
about that deadline going unenforced). PDF/A specifically requires embedded fonts (this codebase
already embeds `StandardFonts` per the file's own comments, a good start), no external references,
and XMP metadata declaring conformance — `pdf-lib` can produce PDF/A-compliant output, but it
isn't configured to today; nothing currently declares or enforces the conformance level.

### API standards (OpenAPI) ⚠️ Open

No OpenAPI/Swagger specification exists anywhere in this repository, despite dozens of REST routes
under `src/app/api/**` (applications, permits, reference data, the public register, the SPE
provisioning flow, and more). The list's API-standards category (the Nederlandse API-strategie /
API Design Rules) expects a government REST API to be machine-readably documented. Worth noting
directly: this codebase already treats OpenAPI as the expected standard for its *inbound*
integration — `src/lib/ncp-client.ts`'s own top comment names the National Dispatcher API it calls
as "the National Dispatcher **OpenAPI**" — it just hasn't been applied to open-daams's own outbound
surface yet.

### Accessibility (EN 301 549 / WCAG) ➖ Cross-reference

Fully assessed in `docs/wcag-2.1-assessment.md`, including two real findings (unlabelled form
controls, two low-contrast text colours) and a clean skip-link/keyboard/focus-visibility baseline.
Not repeated here.

### TLS / transport security ➖ Cross-reference

`docs/owasp-top10-assessment.md`'s A05 finding already covers the CSP/HSTS/security-header set in
`src/proxy.ts` in full. TLS termination itself is a deployment concern in both assessments, not an
application-code one.

### Federated identity (SAML/OpenID Connect) ➖ Cross-reference

Not a new finding — flagged here because OIDC is itself on the comply-or-explain list, and
`docs/owasp-top10-assessment.md`'s A07 remediation already names "Auth.js/OIDC" as the fix for the
root no-real-authentication gap (also tracked as `docs/nis2-assessment.md` (i)/(j) and
`docs/bio2-assessment.md` 5.15–5.18). Worth stating explicitly so that whenever real authentication
is built, it lands on the standards-compliant choice by design, not by coincidence.

### Email security (DKIM/DMARC/SPF/STARTTLS) ℹ️ N/A

No email-sending code exists anywhere in the codebase (`nodemailer`/`smtp` search: zero results) —
these standards don't apply because there's no mail transport to secure, not because of an
oversight.

### ODF (OpenDocument Format) ℹ️ N/A

DAAMS never generates or mandates an office-document format of its own. `Attachment`
(`prisma/schema.prisma:643-656`) stores whatever file type an applicant or NCP payload provides
(often `.docx`) — a pass-through, not a DAAMS-produced document, so ODF's requirements don't attach
to this codebase the way PDF/A's do to the permit PDF above.

## Bottom line

Two genuine, concrete gaps, both document/API-format questions rather than security or
architecture ones: permits are plain PDF, not the archival PDF/A the list calls for, and
open-daams's own REST API has no OpenAPI specification despite already treating that standard as
the expected norm for its one external integration. Everything else either already has a home in
the WCAG/OWASP assessments, doesn't apply because the underlying feature (email, office-document
generation) doesn't exist in this codebase, or sits at a network/hosting layer this
application-only review doesn't reach.

### Suggested order

1. **Cheap, independent of everything else**: add an OpenAPI spec for `src/app/api/**` — doesn't
   require the authentication gap to be resolved first, and directly parallels how the NCP
   integration this codebase already consumes is itself documented.
2. **Small, scoped**: configure `pdf-lib`'s output for PDF/A conformance (embedded fonts are
   already in place; the remaining work is XMP metadata and confirming no external references
   leak into the generated file) — or, if PDF/A turns out impractical for a chosen reason, write
   that reason down explicitly, which is itself a valid comply-or-*explain* outcome.
3. **Already tracked elsewhere**: when real authentication is eventually built (OWASP A07/NIS2
   (i)-(j)/BIO2 5.15–5.18), use OIDC — satisfies that root gap and this list's identity-federation
   entry in the same piece of work.
