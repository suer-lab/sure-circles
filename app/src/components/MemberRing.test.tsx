import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { MemberRing } from "./MemberRing";
import type { Member } from "../types";

function makeMembers(count: number, extra: Partial<Member> = {}): Member[] {
  return Array.from({ length: count }, (_, i) => ({
    keypair: { publicKey: () => `GMEMBER${i}` } as never,
    identity: {} as never,
    funded: i < 2,
    ...extra,
  }));
}

function renderRing(members: Member[], revealed = false) {
  return render(
    <I18nProvider>
      <MemberRing members={members} revealed={revealed} />
    </I18nProvider>,
  );
}

describe("MemberRing", () => {
  it("renders an SVG that scales via viewBox", () => {
    const { container } = renderRing(makeMembers(5));
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("viewBox");
  });

  it("exposes the ring as a single named image", () => {
    renderRing(makeMembers(5));
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "5-member circle, 2 of 5 funded, pot not yet claimed.",
    );
  });

  it("renders a labelled node for every member", () => {
    renderRing(makeMembers(5));
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByLabelText(new RegExp(`^member ${i}$`))).toBeInTheDocument();
    }
  });

  it("marks a member who has already claimed as ineligible", () => {
    renderRing(makeMembers(5, { ineligible: true }));
    const nodes = screen.getAllByLabelText(/ineligible/i);
    expect(nodes).toHaveLength(5);
    for (const node of nodes) {
      expect(node).toHaveAccessibleName(/already claimed/i);
    }
  });

  it("does not mark eligible members as ineligible", () => {
    renderRing(makeMembers(5));
    expect(screen.queryByLabelText(/ineligible/i)).toBeNull();
  });

  it("shows the unlinkability caption only after the payout is revealed", () => {
    const { unmount } = renderRing(makeMembers(5), false);
    expect(screen.queryByText(/payout landed/i)).toBeNull();
    unmount();
    renderRing(makeMembers(5), true);
    expect(screen.getByText(/payout landed/i)).toBeInTheDocument();
  });
});

describe("component stylesheets", () => {
  it("imports every sibling *.module.css from a .tsx component", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const entries = await fs.readdir(dir);
    const modules = entries.filter((f) => f.endsWith(".module.css"));
    const sources = await Promise.all(
      entries.filter((f) => f.endsWith(".tsx")).map((f) => fs.readFile(path.join(dir, f), "utf8")),
    );
    const orphans = modules.filter((m) => !sources.some((src) => src.includes(`./${m}`)));
    expect(orphans).toEqual([]);
  });
});
