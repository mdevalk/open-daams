# WCAG 2.1 assessment: open-daams

_Snapshot date: 2026-08-10._

This is an accessibility assessment of the open-daams codebase against **WCAG 2.1, level AA** —
the bar set by the EU Web Accessibility Directive (2016/2102) and its Dutch implementation
(Besluit digitale toegankelijkheid overheid), which applies to public-sector digital services
including a body like HDAB-NL. It complements `docs/owasp-top10-assessment.md` — same
"assessment, not certification" framing, same codebase.

> **Method.** Live testing via a headless-Chromium Playwright driver
> (`.claude/skills/run-web/driver.mjs`) against the running dev server — the dashboard, the
> applications list and a full application detail page, the permits list and a permit detail page,
> reference data, and the public register — plus a full-codebase static read of the patterns found
> live (label/`id` associations, `outline-none` usage, `onClick` targets, table markup, and the
> exact colour pairs used for status text), with contrast ratios computed directly (WCAG's own
> relative-luminance formula, not eyeballed). **Not covered**: no automated scanner (axe-core or
> similar) was run, and no testing with a real screen reader (NVDA/VoiceOver/JAWS) was done —
> both would likely surface issues this method can't. Treat this as a solid first pass, not a full
> audit.

## Summary

| WCAG 2.1 SC | Level | Status | Key finding |
|---|---|---|---|
| 1.1.1 Non-text Content | A | ℹ️ N/A | No `<img>` elements exist anywhere in the codebase — all iconography is inline SVG (`lucide-react`) |
| 1.3.1 Info and Relationships | A | ⚠️ Open | Form controls are visually labelled but not programmatically associated (systemic); public-register data tables have no header `scope` |
| 1.4.1 Use of Color | A | ✅ Clean | Every status indicator checked (badges, dashboard alert dots, deadline text) pairs colour with a text label — nothing is colour-only |
| 1.4.3 Contrast (Minimum) | AA | ⚠️ Open | `text-gray-400` (2.54:1) used for real content in 27 places; a warning-deadline text colour (2.08:1) fails badly |
| 1.4.11 Non-text Contrast | AA | ⚠️ Minor | Default Tailwind `gray-300` form-control borders sit at 1.47:1 against white |
| 2.1.1 Keyboard | A | ✅ Clean | No non-semantic click handler (`<div>`/`<span onClick>`) found anywhere in `src/` |
| 2.4.1 Bypass Blocks | A | ✅ Clean | Working skip link (`#main-content`), correctly hidden until focused |
| 2.4.7 Focus Visible | AA | ✅ Clean | Every `outline-none` override in the codebase is paired with a visible `focus:ring` replacement |
| 3.1.1 Language of Page | A | ✅ Clean | `<html lang={locale}>` correctly reflects the active locale (nl/en/fr) |
| 3.1.2 Language of Parts | AA | ⚠️ Minor | Two `<nav aria-label>`s are hardcoded Dutch text regardless of the active locale |
| 3.3.2 Labels or Instructions | A | ⚠️ Open | Same root cause as 1.3.1's form-control finding |
| 4.1.2 Name, Role, Value | A | ⚠️ Open | Same root cause as 1.3.1's form-control finding |

## Findings

### 1.3.1 / 3.3.2 / 4.1.2 — Form controls lack programmatic labels ⚠️ Open

This is the single most impactful finding, and it's systemic rather than a one-off mistake — the
same pattern repeats across the codebase: a `<label>` rendered as a plain sibling `<div>`/`<p>`
immediately before its control, with no `htmlFor`/`id` pair, no `aria-label`, and no wrapping. It
looks correct visually (confirmed on screen) but is invisible to the accessibility tree — a screen
reader landing on the control announces nothing, or at best the placeholder text (which
disappears the moment a value is entered, and isn't a substitute for a label under 3.3.2 in any
case).

Confirmed live and in source, three representative cases:
- `src/app/[locale]/applications/page.tsx:59-86` — the Search/Status/Type/Source filter row.
  Visually labelled (`<label className="...">{t('searchLabel')}</label>` etc.), but no `htmlFor`.
- `src/components/FeeEstimatePanel.tsx:313-369` — SPE operator/type selects and the setup/usage
  fee inputs. Same pattern: a preceding `<label>` with no `htmlFor`, even though the row-remove
  button two lines above it (`FeeEstimatePanel.tsx:302`) correctly uses `aria-label` — the
  labelling convention exists in this codebase, it's just not applied to `<label>`/control pairs.
- `src/components/PermitChangeRequestPanel.tsx:226-300` — here there's no visual label at all for
  the SPE-operator `<select>` or the change-request-type `<select>`; the justification `<textarea>`
  relies entirely on a `placeholder`.

**Fix**: give each control a stable `id` and point its `<label>` at it with `htmlFor` (or wrap the
control in the `<label>`) — a mechanical, low-risk change since the visual output doesn't move.

### 1.3.1 — Public-register tables have no header `scope` ⚠️ Open

`src/app/[locale]/public/page.tsx:64-68` and `:96-101` — both tables (Published applications,
Published decisions) render plain `<th>` cells with no `scope="col"`. This is the one genuinely
public, unauthenticated page in the app (Art. 57/58/61(4) transparency register), so it's the
highest-stakes place in the codebase for this to be right. A screen reader can still read the
table linearly without `scope`, but loses the "which column is this cell part of" association a
sighted user gets for free from the table layout.

**Fix**: add `scope="col"` to each `<th>` — no visual change, one attribute per cell.

### 1.4.3 Contrast (Minimum) ⚠️ Open

Two distinct colour values fail AA's 4.5:1 minimum for normal-size text, computed directly from
the hex values in source (not estimated):

- **`text-gray-400` (`#9ca3af` on white) — 2.54:1.** Used in **27 places** across the codebase for
  real, meaningful content, not decoration: log/history timestamps
  (`src/app/[locale]/permits/[id]/page.tsx:494` — `{log.user.name} · {log.user.role} ·
  {formatDateTime(log.createdAt)}`), applicant/data-user names on cards and lists
  (`ApplicationCard.tsx:28`, `permits/page.tsx:180`, `financials/page.tsx:101,246`), and several
  empty-state messages (`NotesList.tsx:77`, `SpeTypeList.tsx:114`). This is the most-repeated
  contrast failure in the app by occurrence count.
- **The amber "deadline due soon" text colour (`#f0a500` on white) — 2.08:1**, a severe fail.
  `src/components/ApplicationCard.tsx:59-63` uses this colour specifically to draw attention to an
  approaching decision deadline — the one piece of text most in need of being legible ends up the
  hardest to read.

For comparison, everything else checked (badge text/background pairs, the red overdue-deadline
colour, the public register's Positive/Negative pills, nav text on the dark-blue header) passed
comfortably at 4.8:1–10.2:1 — this isn't a systemic colour-system problem, just these two specific
values.

**Fix**: darken `text-gray-400` to at least Tailwind's `gray-500` (`#6b7280`, 4.83:1 — already
used elsewhere in the app and passes) for anywhere it carries real content; replace `#f0a500` as a
*text* colour with something closer to the `#6b4c00` already used successfully as the
`PRE_SCREENING`/`AWAITING_ADDITIONAL_INFORMATION` badge text colour (7.13:1) — amber can stay as a
background/border accent, just not as small foreground text.

### 1.4.11 Non-text Contrast ⚠️ Minor

Default Tailwind `border-gray-300` (`#d1d5db` on white — 1.47:1) is the idle-state border colour
on the great majority of form inputs/selects across the app (visible throughout the screenshots
taken during this assessment). WCAG 2.1's 1.4.11 asks for 3:1 on the boundary of a UI component
that needs to be visually identifiable. In practice every field also carries a visible `focus:ring`
on interaction and sits inside a labelled context, which softens the real-world impact — flagging
as minor/lower-priority rather than blocking.

### 3.1.2 Language of Parts ⚠️ Minor

`src/app/[locale]/layout.tsx:70,96` — `<nav aria-label="Hoofdnavigatie">` and
`<nav aria-label="Overige navigatie">` are hardcoded Dutch, unlike every other string in the
header (which correctly goes through `t()`). A screen-reader user with the interface set to
English or French still hears these two landmark names in Dutch. Cosmetic/minor — the visible nav
labels themselves are correctly translated, only the two landmark names aren't.

## What's already working well

Worth stating plainly, not just the gaps: the things checked here were **clean**, not merely
untested.
- **Colour is never the only signal.** Every status indicator inspected — `StatusBadge`, the
  dashboard's overdue/due-soon/awaiting-decision dots, the public register's Positive/Negative
  pills, `ApplicationCard`'s deadline text — pairs its colour with an explicit text label.
- **No keyboard traps.** A full-codebase search for `<div>`/`<span onClick>` — the classic way an
  app quietly becomes mouse-only — returned zero matches. Every interactive element found is a
  real `<button>` or `<a>`.
- **Focus is never silently removed.** All 18 files using `outline-none` pair it with a
  `focus:ring`/`focus-visible` replacement on the same element — checked by grep, not sampling.
- **The skip link actually works.** `href="#main-content"` in the header matches a real
  `id="main-content"` on `<main>` in `layout.tsx:129`, and it's correctly hidden until focused
  (`sr-only focus:not-sr-only`) rather than either permanently hidden or permanently visible.
- **`<html lang>` is correct**, driven by the real active locale rather than hardcoded, across all
  three supported languages.
- **The one icon-only button found** (`FeeEstimatePanel.tsx:302`, a ✕ to remove a fee row) has a
  proper `aria-label`.

## Bottom line

The app is in noticeably better shape than a typical first WCAG pass finds — no colour-only
status, no keyboard traps, no orphaned focus removal, a genuinely working skip link. The gaps that
exist are concentrated and mechanical to fix rather than architectural: one repeated
labelling-association mistake across several form components, and two specific colour values that
were picked without a contrast check. Nothing found here requires a redesign.

### Suggested order

1. **Highest count, lowest risk**: fix the `<label>`/control association pattern
   (`FeeEstimatePanel.tsx`, `applications/page.tsx`, `PermitChangeRequestPanel.tsx`, and any other
   component sharing the pattern) — add `htmlFor`/`id` pairs, no visual change.
2. **Two colour swaps**: `text-gray-400` → `gray-500` for real content; the `#f0a500`
   deadline-warning text colour → the existing `#6b4c00` (already proven at 7.13:1 elsewhere).
3. **Small/mechanical**: `scope="col"` on the public register's table headers; translate the two
   hardcoded Dutch `aria-label`s via `t()` like the rest of the header already does.
4. **Follow-up, not blocking**: run an automated scanner (axe-core) and a real screen-reader pass
   (VoiceOver is free on macOS) before treating this as a complete AA review — this assessment's
   method has real limits, noted above.
