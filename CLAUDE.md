# CLAUDE.md

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## Regulatory context

This project implements the EHDS secondary-use workflow following the TEHDAS2 DAAMS
specifications. Always use the **final** Regulation numbering, not the draft-proposal numbering.

### EHDS legal text

- **Regulation (EU) 2025/327** establishing the European Health Data Space (EHDS) —
  <https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng>
  - Relevant part: **Chapter IV — Secondary use of electronic health data** (Articles 51–80).
  - Key articles used in this codebase: Art. 53 (purposes for secondary use), Art. 57–58
    (HDAB tasks, transparency), Art. 62 (fees), Art. 67 (health data access applications),
    Art. 68 (data permit + decision deadline), Art. 69 (health data request), Art. 71 (opt-out),
    Art. 73 (secure processing environment), Art. 77–80 (dataset catalogue).

### TEHDAS2 documentation

- **D6.2 — Guideline for data users on good application and access practice** —
  <https://tehdas.eu/wp-content/uploads/2025/10/d6.2-guideline-for-data-users-on-good-application-and-access-practice.pdf>
- **D6.3 — Guideline for HDABs on the procedures and formats for data access** —
  <https://tehdas.eu/wp-content/uploads/2025/09/draft-guideline-for-health-data-access-bodies-on-the-procedures-and-formats-for-data-access.pdf>
- **D6.4 — Data Access Application Management System (DAAMS): Technical specification for HDABs** (the core specification this app
  implements; v0.5, 24 March 2026) —
  <https://tehdas.eu/wp-content/uploads/2026/06/d6.4-data-access-application-management-system-daams-technical-specification-for-health-data-access-bodies.pdf>
- **D7.1 — Guideline on how to use data in a secure processing environment** (relevant to the
  SPE-provisioning feature) —
  <https://tehdas.eu/wp-content/uploads/2025/07/d7.1-guideline-on-how-to-use-data-in-a-secure-processing-environment.pdf>
- **Draft Guideline on fees related to the EHDS Regulation** (TEHDAS2 4.1.1; relevant to the
  fee-estimate and invoicing features, Art. 62) —
  <https://tehdas.eu/wp-content/uploads/2025/09/draft-guideline-on-fees-related-to-the-ehds-regulation.pdf>

## Working conventions

- **Git:** "commit" means commit **and** push to `main` in the same step (no separate
  confirmation, no feature branch/PR unless asked). Stage files explicitly — never
  `git add -A`/`git add -u` right after an `npm install`, as it sweeps `package-lock.json`
  churn into the commit and breaks `git pull`.
- **Schema changes** require the developer to run `npm run db:push` locally (applies the
  Prisma schema and regenerates the client), then restart `npm run dev`.
- **After `npm install`**, run `npx prisma generate` (the postinstall is often blocked), or
  the `@prisma/client` import will be stale/missing.
- The **PostgreSQL database runs locally** (see `docker-compose.yml`); the app is seeded with
  `npm run db:seed`. There is **no real authentication** — RBAC trusts a client-supplied
  `userId` (documented gap, do not silently "fix").
- Verify non-trivial changes with `npx tsc --noEmit` (baseline is 0 errors).

## Project state (handoff)

Design/gap detail lives in `docs/`: `d6.4-gap-analysis.md` (TEHDAS2 D6.4 v0.5 vs implementation),
`d6.4-status-model.md` (status tables), `ehds-article-map.md` (article → status),
`ehds-gap-analysis.md` (plain EHDS Regulation-only gap analysis), `architecture.md`.

**Scope:** open-daams is the **back-office DAAMS**. Out of scope: the applicant front-office
(D6.4 §6), the dataset catalogue (Art. 77–80) and dataset selection against it (§6.2) — those
are the central platform / WP6.

**Permit model (recent work):** the permit is an **append-only version chain** — an approved
amendment / renewal / revocation-appeal creates a *new* `DataPermit` row (`version` + 1,
`isCurrent`, `previousPermit` self-relation) rather than mutating in place. Two-axis lifecycle:
`DataPermitStatus` (the permit's own status) vs `PermitChangeRequest` (the workflow). Full
permit id renders as `DP-NL-2025-0001-v2` via `formatPermitId`.

**i18n:** the tool chrome is localised (nl/en/fr) via next-intl message namespaces; permit
*content* and the issued PDF stay in the issuing HDAB's language by design.

**Known open items:** server-side API error strings are still hardcoded EN/NL (client fallbacks
are i18n'd via the `errors` namespace); IPR / trade secrets (Art. 52) is noted but not yet a
data field; SPE, data-holder extraction, and HealthData@EU/NCP are simulated shells, not real
integrations.
