import { defineMiddleware } from "astro:middleware";
import { db } from "./db/client";
import { getLocale, runWithLocale, t } from "./i18n";
import { isLocale } from "./i18n/locales";
import { auth } from "./lib/auth";
import { isStaff } from "./server/authz";
import { demoExpiry, demoSlug, demoToken, removeExpiredDemos } from "./server/demo";
import { HttpError } from "./server/errors";
import { resolveLocale, saveUserLocale, setLangCookie } from "./server/locale";
import { ensureSessions } from "./server/schedule";
import { settleStudio } from "./server/settlement";
import { resolveStudioContext, type StudioContext } from "./server/studio-context";

const STUDIO_PATH = /^\/s\/([^/]+)(?:\/|$)/;

/**
 * Keep each studio's credits and upcoming classes current before its pages render. Throttled per
 * studio so a busy page doesn't run it on every request; the scheduled job covers quiet periods.
 */
const lastRefresh = new Map<string, number>();
const REFRESH_EVERY_MS = 30_000;
async function refreshStudio(studioId: string, timezone: string) {
  const last = lastRefresh.get(studioId) ?? 0;
  if (Date.now() - last < REFRESH_EVERY_MS) return;
  lastRefresh.set(studioId, Date.now());
  await settleStudio(studioId, timezone);
  await ensureSessions({ studioId, timezone });
}

/** Expired demo studios are removed every few minutes; the scheduled job does it too. */
let lastDemoSweep = 0;
function sweepDemos() {
  if (Date.now() - lastDemoSweep < 5 * 60_000) return;
  lastDemoSweep = Date.now();
  removeExpiredDemos().catch((e) => console.error("Removing expired demos failed", e));
}

/** Demo visitors stay inside their own sandbox: no new studios, no joining others, no account changes. */
const DEMO_BLOCKED = /^\/(studios\/new|join\/)/;
const DEMO_AUTH_ALLOWED = /^\/api\/auth\/(get-session|sign-out)$/;

export const onRequest = defineMiddleware(async (context, next) => {
  const result = await auth.api.getSession({ headers: context.request.headers });
  const user = result?.user ?? null;
  context.locals.user = user;
  context.locals.session = result?.session ?? null;
  sweepDemos();

  const token = demoToken(user?.email);
  if (token) {
    const slug = demoSlug(token);
    context.locals.demo = { token, slug, expiresAt: await demoExpiry(token) };
    const path = context.url.pathname;
    if (DEMO_BLOCKED.test(path) && !path.startsWith(`/join/${slug}/`)) return context.redirect(`/s/${slug}`);
    if (path.startsWith("/api/auth/") && !DEMO_AUTH_ALLOWED.test(path))
      return new Response("Not available in the demo", { status: 403 });
  }

  // Language picked from the switcher: remember it and drop it from the address.
  const lang = context.url.searchParams.get("lang");
  if (isLocale(lang) && context.request.method === "GET") {
    setLangCookie(context.cookies, lang);
    if (user) await saveUserLocale(user.id, lang);
    const clean = new URL(context.url);
    clean.searchParams.delete("lang");
    return context.redirect(clean.pathname + clean.search, 303);
  }

  const match = STUDIO_PATH.exec(context.url.pathname);
  let studio: StudioContext | null = null;
  if (match && user) studio = await resolveStudioContext(db, decodeURIComponent(match[1]!), user.id);

  const locale = await resolveLocale({
    cookies: context.cookies,
    acceptLanguage: context.request.headers.get("accept-language"),
    userId: user?.id ?? null,
    studioLocale: studio?.locale ?? null,
  });
  context.locals.locale = locale;

  return runWithLocale(locale, async () => {
    if (match) {
      if (!user) {
        const nextUrl = encodeURIComponent(context.url.pathname + context.url.search);
        return context.redirect(`/login?next=${nextUrl}`);
      }
      // Not found and not a member look the same, so studio addresses can't be probed.
      if (!studio) return errorPage(404, t("common.notFound"));
      // Admin pages are for staff; members get the same 404 as any unknown page.
      if (/^\/s\/[^/]+\/admin(\/|$)/.test(context.url.pathname) && !isStaff(studio.role)) {
        return errorPage(404, t("common.notFound"));
      }
      context.locals.studio = studio;
      await refreshStudio(studio.studioId, studio.timezone);
    }

    try {
      return await next();
    } catch (e) {
      // Permission and not-found errors thrown while rendering a page become a plain error page.
      if (e instanceof HttpError) return errorPage(e.status, e.message);
      throw e;
    }
  });
});

function errorPage(status: number, message: string): Response {
  const title =
    status === 404 ? t("common.notFound") : status === 403 ? t("common.notAllowed") : t("common.somethingWrong");
  const html = `<!doctype html><html lang="${getLocale()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,sans-serif;background:#f6f5f3;color:#1c1917;display:grid;place-items:center;min-height:100vh;margin:0">
<main style="text-align:center;max-width:28rem;padding:2rem"><h1 style="font-size:1.5rem">${escapeHtml(title)}</h1><p style="color:#57534e">${escapeHtml(message)}</p>
<p><a href="javascript:history.back()" style="color:#1c1917">${escapeHtml(t("common.goBack"))}</a> · <a href="/" style="color:#1c1917">${escapeHtml(t("common.home"))}</a></p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
