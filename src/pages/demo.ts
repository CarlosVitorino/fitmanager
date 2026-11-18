import type { APIRoute } from "astro";
import { DemoUnavailable, startDemo, type DemoRole } from "../server/demo";
import { redirectWithCookies } from "../server/forms";

/** Demos started per address in the last window; stops one visitor from building hundreds. */
const recent = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const PER_WINDOW = 6;

function allowed(ip: string): boolean {
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= PER_WINDOW) return false;
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return true;
}

export const POST: APIRoute = async ({ request, clientAddress, locals, redirect }) => {
  if (locals.demo) return redirect(`/s/${locals.demo.slug}`, 303);
  const form = await request.formData();
  const role: DemoRole = form.get("as") === "member" ? "member" : "coach";
  let ip = "unknown";
  try {
    ip = clientAddress;
  } catch {
    /* not available behind some adapters */
  }
  // Only in production: local tooling (like the screenshot script) builds many demos in a row.
  if (import.meta.env.PROD && !allowed(ip)) return redirect("/?demo=busy", 303);
  try {
    const { slug, signIn } = await startDemo(role);
    if (!signIn.ok) return redirect("/?demo=failed", 303);
    return redirectWithCookies(role === "coach" ? `/s/${slug}` : `/s/${slug}/me`, signIn);
  } catch (e) {
    if (e instanceof DemoUnavailable) return redirect("/?demo=busy", 303);
    console.error("Demo could not be built", e);
    return redirect("/?demo=failed", 303);
  }
};

export const GET: APIRoute = ({ redirect }) => redirect("/", 302);
