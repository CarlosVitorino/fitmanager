import type { APIRoute } from "astro";
import { auth } from "../lib/auth";
import { redirectWithCookies } from "../server/forms";

export const POST: APIRoute = async ({ request }) => {
  const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
  return redirectWithCookies("/login", res);
};
