/**
 * Project links surfaced in the UI (bug reports, known-limitations page).
 *
 * PLACEHOLDER: the canonical public repository does not exist yet. These use
 * the reserved `.invalid` TLD (RFC 2606), which can never resolve, so nothing
 * can be sent to a third party by accident. Replace `PROJECT_URL` with the real
 * repository URL once it is published; everything else derives from it.
 */
export const PROJECT_URL = "https://repository.invalid/sure-circles";

export const ISSUES_URL = `${PROJECT_URL}/issues`;
export const NEW_ISSUE_URL = `${ISSUES_URL}/new`;
export const NEW_BUG_REPORT_URL = `${NEW_ISSUE_URL}?template=bug_report.yml`;
export const KNOWN_LIMITATIONS_URL = `${PROJECT_URL}#known-limitations`;
