/** Every language has every message, with the same placeholders, and plural rules resolve. */
import { describe, expect, it } from "vitest";
import { allMessages, runWithLocale, t } from ".";
import { LOCALES, matchAcceptLanguage } from "./locales";

type Tree = { [k: string]: string | Tree };
function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const english = flatten(allMessages.en as Tree);

describe.each(LOCALES.filter((l) => l !== "en"))("%s messages", (locale) => {
  const messages = flatten(allMessages[locale] as Tree);

  it("has exactly the English keys", () => {
    const strip = (k: string) => k.replace(/\.(zero|one|two|few|many|other)$/, "");
    expect([...new Set([...messages.keys()].map(strip))].sort()).toEqual(
      [...new Set([...english.keys()].map(strip))].sort(),
    );
  });

  it("uses the same placeholders as English", () => {
    for (const [key, en] of english) {
      const other = messages.get(key) ?? messages.get(key.replace(/\.one$/, ".other"));
      if (other === undefined) continue;
      // A singular form may say "your last credit" instead of repeating {count}.
      const want = placeholders(en).filter((p) => !(key.endsWith(".one") && p === "count"));
      for (const p of want) expect(placeholders(other), `${locale}:${key}`).toContain(p);
    }
  });

  it("has no empty messages", () => {
    for (const [key, value] of messages) expect(value.trim(), `${locale}:${key}`).not.toBe("");
  });
});

describe("t()", () => {
  it("translates in the request's language with plurals", () => {
    expect(runWithLocale("de", () => t("common.classes", { count: 1 }))).toBe("1 Kurs");
    expect(runWithLocale("de", () => t("common.classes", { count: 3 }))).toBe("3 Kurse");
    expect(runWithLocale("fr", () => t("nav.calendar"))).toBe("Calendrier");
    expect(t("nav.calendar")).toBe("Calendar");
  });

  it("matches browser languages", () => {
    expect(matchAcceptLanguage("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt");
    expect(matchAcceptLanguage("it-IT,it;q=0.9,de;q=0.5")).toBe("de");
    expect(matchAcceptLanguage("ja")).toBeNull();
  });
});
