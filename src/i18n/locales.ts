/** Supported languages. Safe to import anywhere, including browser islands. */
export const LOCALES = ["en", "de", "es", "fr", "pt"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  pt: "Português",
};

/** BCP 47 tags for Intl formatting (numbers, currency, plural rules). */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  pt: "pt-PT",
};

/** Schedule-X ships pt-BR but not pt-PT; its labels ("Hoje", "Semana"…) are the same. */
export const CALENDAR_LOCALE_TAGS: Record<Locale, string> = { ...LOCALE_TAGS, pt: "pt-BR" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Best supported match for an Accept-Language header, or null. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const wanted = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { lang: (tag ?? "").toLowerCase().split("-")[0], q: q ? Number(q.split("=")[1]) : 1 };
    })
    .filter((w) => w.lang && w.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const w of wanted) if (isLocale(w.lang)) return w.lang;
  return null;
}
