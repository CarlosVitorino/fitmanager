/**
 * Server-side translation. The middleware runs each request inside `runWithLocale`, so anything
 * rendering that request (pages, components, form handlers, validation) can call `t()` directly.
 * Islands don't import this; they receive translated labels as props.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_LOCALE, LOCALES, LOCALE_TAGS, type Locale } from "./locales";
import { translate, type Vars } from "./translate";
import type { Paths } from "./types";
import common from "./messages/common";
import nav from "./messages/nav";
import setup from "./messages/setup";

const namespaces = { common, nav, setup };

type Namespaces = typeof namespaces;
export type Messages = { [N in keyof Namespaces]: Namespaces[N]["en"] };
export type MessageKey = Paths<Messages>;

type Tree = Parameters<typeof translate>[1];
const byLocale = Object.fromEntries(
  LOCALES.map((l) => [l, Object.fromEntries(Object.entries(namespaces).map(([n, m]) => [n, m[l]]))]),
) as unknown as Record<Locale, Tree>;

const storage = new AsyncLocalStorage<Locale>();

export function runWithLocale<T>(locale: Locale, fn: () => T): T {
  return storage.run(locale, fn);
}

export function getLocale(): Locale {
  return storage.getStore() ?? DEFAULT_LOCALE;
}

export function getLocaleTag(): string {
  return LOCALE_TAGS[getLocale()];
}

/** Translates a key in the current request's language. */
export function t(key: MessageKey, vars?: Vars): string {
  const locale = getLocale();
  return translate(locale, byLocale[locale], byLocale.en, key, vars);
}

/** Translates in a specific language (e.g. for the language picker). */
export function tIn(locale: Locale, key: MessageKey, vars?: Vars): string {
  return translate(locale, byLocale[locale], byLocale.en, key, vars);
}

/** Zod error option that translates lazily, at validation time, in the request's language. */
export function msg(key: MessageKey, vars?: Vars) {
  return { error: () => t(key, vars) };
}

/** All messages of every language, for the completeness test. */
export const allMessages = byLocale;

export { LOCALES, type Locale } from "./locales";
