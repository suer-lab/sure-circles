/**
 * Locale DATA assertions.
 *
 * Belong here: key-set parity across locale files, empty-value checks,
 * interpolation placeholder consistency, and "no locale may carry a key
 * that en.ts lacks".
 *
 * Do NOT put I18nProvider / t() behaviour here — that lives in
 * `app/src/i18n.test.tsx`.
 */
import { describe, it, expect } from "vitest";

function loadAllLocales(): Record<string, Record<string, string>> {
  const localeModules = import.meta.glob<{ default: Record<string, string> }>("./!(*.test).ts", {
    eager: true,
  });

  const locales: Record<string, Record<string, string>> = {};
  for (const [path, mod] of Object.entries(localeModules)) {
    const match = path.match(/\.\/([a-zA-Z-]+)\.ts$/);
    if (!match) continue;
    const code = match[1];
    if (code === undefined || code.endsWith(".test")) continue;
    locales[code] = mod.default;
  }
  return locales;
}

function extractPlaceholders(template: string): Set<string> {
  const placeholders = new Set<string>();
  const regex = /\{([a-zA-Z0-9_]+)\}/g;
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (match[1] !== undefined) placeholders.add(match[1]);
  }
  return placeholders;
}

function formatPlaceholders(placeholders: Set<string>): string {
  return placeholders.size === 0 ? "(none)" : Array.from(placeholders).sort().join(", ");
}

/**
 * Keys deliberately absent from a non-English locale until a verified translation is supplied.
 * English is canonical; the runtime falls back to it per key (see i18n.tsx). Keep in step with
 * docs/deferred-features.md. Do not fill these with machine translations.
 */
const AWAITING_TRANSLATION: Record<string, string[]> = {
  ar: [
    "error.contribution.empty",
    "error.contribution.not_a_number",
    "error.contribution.not_positive",
    "error.contribution.out_of_range",
    "error.contribution.pot_overflow",
    "error.contribution.too_many_decimals",
    "error.contribution.unaffordable",
    "error.invalidCircleParams",
    "landing.contributionLabel",
    "step.label",
  ],
  es: ["step.label"],
  fr: ["step.label"],
  hi: ["step.label"],
  pt: ["step.label"],
  tl: ["step.label"],
  yo: ["step.label"],
  zh: ["step.label"],
};

describe("locale data", () => {
  const locales = loadAllLocales();
  const localeNames = Object.keys(locales).sort();
  const englishLocale = locales["en"] ?? {};

  it("should have English locale loaded", () => {
    expect(locales["en"]).toBeDefined();
    expect(Object.keys(englishLocale).length).toBeGreaterThan(0);
  });

  it("no locale carries a key English lacks, and every gap is a recorded one", () => {
    const englishKeys = Object.keys(englishLocale);
    const failures: string[] = [];

    for (const localeName of localeNames) {
      if (localeName === "en") continue;
      const locale = locales[localeName] ?? {};

      const extraKeys = Object.keys(locale).filter((key) => !(key in englishLocale));
      const missingKeys = englishKeys.filter((key) => !(key in locale));
      const allowed = new Set(AWAITING_TRANSLATION[localeName] ?? []);
      const unrecorded = missingKeys.filter((key) => !allowed.has(key));
      const stale = [...allowed].filter((key) => !missingKeys.includes(key));

      if (extraKeys.length > 0) {
        failures.push(`"${localeName}" has keys English lacks: ${extraKeys.join(", ")}`);
      }
      if (unrecorded.length > 0) {
        failures.push(
          `"${localeName}" is missing keys not recorded as awaiting translation: ${unrecorded.join(", ")}`,
        );
      }
      if (stale.length > 0) {
        failures.push(
          `"${localeName}" lists keys as awaiting translation that are present or unknown: ${stale.join(", ")}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("every English key resolves to a non-empty string in every locale via English fallback", () => {
    for (const localeName of localeNames) {
      const locale = locales[localeName] ?? {};
      for (const key of Object.keys(englishLocale)) {
        const resolved = locale[key] ?? englishLocale[key];
        expect(typeof resolved, `${localeName}:${key}`).toBe("string");
        expect(resolved, `${localeName}:${key}`).not.toBe("");
      }
    }
  });

  it("no locale should have empty string values", () => {
    const failures: string[] = [];

    for (const [localeName, locale] of Object.entries(locales)) {
      const emptyKeys: string[] = [];
      for (const [key, value] of Object.entries(locale)) {
        if (value === "") emptyKeys.push(key);
      }
      if (emptyKeys.length > 0) {
        failures.push(
          `Locale "${localeName}" has empty string values for: ${emptyKeys.join(", ")}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("each locale should have the same placeholders as English for each shared key", () => {
    const englishKeys = Object.keys(englishLocale);
    const failures: string[] = [];

    for (const key of englishKeys) {
      const englishPlaceholders = extractPlaceholders(englishLocale[key] ?? "");

      for (const localeName of localeNames) {
        if (localeName === "en") continue;
        const localeTemplate = locales[localeName]?.[key];
        if (localeTemplate === undefined) continue;

        const localePlaceholders = extractPlaceholders(localeTemplate);
        const missingPlaceholders = Array.from(englishPlaceholders).filter(
          (p) => !localePlaceholders.has(p),
        );
        const extraPlaceholders = Array.from(localePlaceholders).filter(
          (p) => !englishPlaceholders.has(p),
        );

        if (missingPlaceholders.length > 0 || extraPlaceholders.length > 0) {
          failures.push(
            `Key "${key}" in locale "${localeName}": expected {${formatPlaceholders(englishPlaceholders)}}, got {${formatPlaceholders(localePlaceholders)}}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
