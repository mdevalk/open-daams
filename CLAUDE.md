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
- **D6.4 — Technical Specifications for a DAAMS for HDABs** (the core specification this app
  implements) —
  <https://tehdas.eu/wp-content/uploads/2025/09/technical-specifications-for-data-access-application-management-system-daams-for-health-data-access-bodies-hdabs.pdf>
- **D7.1 — Guideline on how to use data in a secure processing environment** (relevant to the
  SPE-provisioning feature) —
  <https://tehdas.eu/wp-content/uploads/2025/07/d7.1-guideline-on-how-to-use-data-in-a-secure-processing-environment.pdf>
