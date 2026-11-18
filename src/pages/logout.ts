import type { APIRoute } from "astro";
import { auth } from "../lib/auth";
import { removeDemo } from "../server/demo";
import { redirectWithCookies, safeNext } from "../server/forms";

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData().catch(() => null);
  const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
  // Leaving the demo deletes the visitor's copy of the sample studio.
  if (locals.demo) {
    await removeDemo(locals.demo.token);
    return redirectWithCookies(safeNext(String(form?.get("next") ?? ""), "/?demo=ended"), res);
  }
  return redirectWithCookies(safeNext(String(form?.get("next") ?? ""), "/login"), res);
};
