/**
 * Project links surfaced in the UI (bug reports, known-limitations page).
 *
 * `PROJECT_URL` is the canonical public repository; every other link derives from it, so a repository move
 * is a one-line change here.
 */
export const PROJECT_URL = "https://github.com/suer-lab/sure-circles";

export const ISSUES_URL = `${PROJECT_URL}/issues`;
export const NEW_ISSUE_URL = `${ISSUES_URL}/new`;
export const NEW_BUG_REPORT_URL = `${NEW_ISSUE_URL}?template=bug_report.yml`;
export const KNOWN_LIMITATIONS_URL = `${PROJECT_URL}#known-limitations`;
