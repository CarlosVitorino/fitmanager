declare namespace App {
  interface Locals {
    user: import("./lib/auth").Session["user"] | null;
    session: import("./lib/auth").Session["session"] | null;
    studio?: import("./server/studio-context").StudioContext;
    locale: import("./i18n/locales").Locale;
    /** Set when the signed-in person is a public-demo visitor. */
    demo?: { token: string; slug: string; expiresAt: Date | null };
  }
}
