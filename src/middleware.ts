import { defineMiddleware } from "astro:middleware";
import { db } from "./db/client";
import { auth } from "./lib/auth";
import { resolveStudioContext } from "./server/studio-context";

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
    context.locals.studio = studio;
  }

  return next();
});
