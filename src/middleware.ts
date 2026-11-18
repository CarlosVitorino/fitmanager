import { defineMiddleware } from "astro:middleware";
import { db } from "./db/client";
import { auth } from "./lib/auth";
import { isStaff } from "./server/authz";
import { HttpError } from "./server/errors";
import { ensureSessions } from "./server/schedule";
import { settleStudio } from "./server/settlement";
import { resolveStudioContext } from "./server/studio-context";

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

const STUDIO_PATH = /^\/s\/([^/]+)(?:\/|$)/;

export const onRequest = defineMiddleware(async (context, next) => {
  const result = await auth.api.getSession({ headers: context.request.headers });
  context.locals.user = result?.user ?? null;
  context.locals.session = result?.session ?? null;

  const match = STUDIO_PATH.exec(context.url.pathname);
  if (match) {
    if (!context.locals.user) {
      const nextUrl = encodeURIComponent(context.url.pathname + context.url.search);
      return context.redirect(`/login?next=${nextUrl}`);
    }
    const studio = await resolveStudioContext(db, decodeURIComponent(match[1]!), context.locals.user.id);
    // Not found and not a member look the same, so studio addresses can't be probed.
    if (!studio) return new Response("Not found", { status: 404 });
    // Admin pages are for staff; members get the same 404 as any unknown page.
    if (/^\/s\/[^/]+\/admin(\/|$)/.test(context.url.pathname) && !isStaff(studio.role)) {
      return new Response("Not found", { status: 404 });
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

function errorPage(status: number, message: string): Response {
  const title = status === 404 ? "Not found" : status === 403 ? "Not allowed" : "Something's wrong";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#f5f5f4;color:#1c1917;display:grid;place-items:center;min-height:100vh;margin:0">
<main style="text-align:center;max-width:28rem;padding:2rem"><h1 style="font-size:1.5rem">${title}</h1><p style="color:#57534e">${escapeHtml(message)}</p>
<p><a href="javascript:history.back()" style="color:#1c1917">Go back</a> · <a href="/" style="color:#1c1917">Home</a></p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
