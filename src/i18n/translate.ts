/** Pure lookup and interpolation, no server dependencies. */
import { LOCALE_TAGS, type Locale } from "./locales";
import type { Plural } from "./types";

export type Vars = Record<string, string | number | null | undefined>;
type Tree = { [key: string]: string | Plural | Tree };

const pluralRules = new Map<Locale, Intl.PluralRules>();

function lookup(tree: Tree, key: string): string | Plural | undefined {
  let node: string | Plural | Tree | undefined = tree;
  for (const part of key.split(".")) {
    if (!node || typeof node === "string") return undefined;
    node = (node as Tree)[part];
  }
  return node as string | Plural | undefined;
}

export function interpolate(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name]),
  );
}

/**
 * Translates `key` from `messages`, falling back to English, then to the key itself (so a missing
 * translation is visible but never breaks a page).
 */
export function translate(locale: Locale, messages: Tree, fallback: Tree, key: string, vars?: Vars): string {
  const found = lookup(messages, key) ?? lookup(fallback, key);
  if (found === undefined) return key;
  if (typeof found === "string") return interpolate(found, vars);
  if (typeof found === "object" && "other" in found) {
    const count = Number(vars?.count ?? 0);
    if (count === 0 && found.zero) return interpolate(found.zero, vars);
    let rules = pluralRules.get(locale);
    if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(LOCALE_TAGS[locale])));
    const form = rules.select(count) as keyof Plural;
    return interpolate(found[form] ?? found.other, vars);
  }
  return key;
}
