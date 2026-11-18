import type { AstroCookies } from "astro";
import { eq } from "drizzle-orm";
import { userPreference } from "../db/schema";
import { DEFAULT_LOCALE, isLocale, matchAcceptLanguage, type Locale } from "../i18n/locales";
import { db } from "./tx";

export const LANG_COOKIE = "fm_lang";
const YEAR = 60 * 60 * 24 * 365;

export function setLangCookie(cookies: AstroCookies, locale: Locale) {
  cookies.set(LANG_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax", httpOnly: false });
}

export async function saveUserLocale(userId: string, locale: Locale) {
  await db
    .insert(userPreference)
    .values({ userId, locale })
    .onConflictDoUpdate({ target: userPreference.userId, set: { locale, updatedAt: new Date() } });
}

/**
 * The language for a request, most specific first:
 *  1. what the person picked (cookie, or their saved preference on a new device)
 *  2. their browser's language, if we support it
 *  3. the studio's default language
 *  4. English
 */
export async function resolveLocale(opts: {
  cookies: AstroCookies;
  acceptLanguage: string | null;
  userId: string | null;
  studioLocale: string | null;
}): Promise<Locale> {
  const fromCookie = opts.cookies.get(LANG_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  if (opts.userId) {
    const [pref] = await db.select({ locale: userPreference.locale }).from(userPreference).where(eq(userPreference.userId, opts.userId));
    if (isLocale(pref?.locale)) {
      setLangCookie(opts.cookies, pref.locale);
      return pref.locale;
    }
  }
  return matchAcceptLanguage(opts.acceptLanguage) ?? (isLocale(opts.studioLocale) ? opts.studioLocale : DEFAULT_LOCALE);
}
