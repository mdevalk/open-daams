/**
 * Software/document brand shown in the app header, page titles, and the permit
 * document masthead/footer.
 *
 * Configurable via the `DAAMS_APP_NAME` environment variable so other member
 * states can rebrand this reference implementation without code changes
 * (e.g. `DAAMS_APP_NAME="DAAMS-BE"`). Defaults to "DAAMS-NL".
 *
 * This is the software/document brand only — it is distinct from the fictional
 * issuing authority name ("Health Data Access Body Nederland (HDAB-NL)"), which
 * is separate legal/regulatory text.
 *
 * Read from a non-public env var, so it is resolved at runtime on the server
 * (set it in `.env` and restart — no rebuild needed) and is server-side only.
 */
export const APP_NAME = process.env.DAAMS_APP_NAME?.trim() || 'DAAMS-NL';
