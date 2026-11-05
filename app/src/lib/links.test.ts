import { describe, it, expect } from "vitest";
import {
  ISSUES_URL,
  KNOWN_LIMITATIONS_URL,
  NEW_BUG_REPORT_URL,
  NEW_ISSUE_URL,
  PROJECT_URL,
} from "./links";

describe("project links", () => {
  it("point at the canonical public repository", () => {
    expect(PROJECT_URL).toBe("https://github.com/suer-lab/sure-circles");
    expect(ISSUES_URL).toBe("https://github.com/suer-lab/sure-circles/issues");
    expect(NEW_ISSUE_URL).toBe("https://github.com/suer-lab/sure-circles/issues/new");
    expect(NEW_BUG_REPORT_URL).toBe(
      "https://github.com/suer-lab/sure-circles/issues/new?template=bug_report.yml",
    );
    expect(KNOWN_LIMITATIONS_URL).toBe("https://github.com/suer-lab/sure-circles#known-limitations");
  });

  it("all derive from PROJECT_URL and are well-formed https URLs", () => {
    for (const link of [ISSUES_URL, NEW_ISSUE_URL, NEW_BUG_REPORT_URL, KNOWN_LIMITATIONS_URL]) {
      expect(link.startsWith(PROJECT_URL)).toBe(true);
      expect(new URL(link).protocol).toBe("https:");
    }
  });

  it("never contain a placeholder host (a reserved .invalid host would send users nowhere)", () => {
    for (const link of [PROJECT_URL, ISSUES_URL, NEW_ISSUE_URL, NEW_BUG_REPORT_URL, KNOWN_LIMITATIONS_URL]) {
      expect(new URL(link).hostname.endsWith(".invalid")).toBe(false);
      expect(link).not.toMatch(/<[^>]+>/);
    }
  });

  it("reference files that actually exist in the repository", async () => {
    // The bug-report link names an issue template; the known-limitations link targets a README heading.
    const { existsSync, readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname } = await import("node:path");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    expect(existsSync(resolve(root, ".github", "ISSUE_TEMPLATE", "bug_report.yml"))).toBe(true);
    expect(readFileSync(resolve(root, "README.md"), "utf8")).toMatch(/^## Known limitations$/m);
  });
});
