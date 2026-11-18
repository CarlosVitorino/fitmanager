import type { APIRoute } from "astro";
import { DemoUnavailable, enterDemo, startDemo, type DemoRole } from "../server/demo";
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
  const form = await request.formData();
  const role: DemoRole = form.get("as") === "member" ? "member" : "coach";
  // Already in a demo: switch to the other side of the same studio instead of building a new one.
  if (locals.demo) {
    const { signIn, landing } = await enterDemo(locals.demo.token, role);
    return signIn.ok ? redirectWithCookies(landing, signIn) : redirect(`/s/${locals.demo.slug}`, 303);
  }
  let ip = "unknown";
  try {
    ip = clientAddress;
  } catch {
    /* not available behind some adapters */
  }
  // Only in production: local tooling (like the screenshot script) builds many demos in a row.
  if (import.meta.env.PROD && !allowed(ip)) return redirect("/?demo=busy", 303);
  try {
    const { signIn, landing } = await startDemo(role);
    if (!signIn.ok) return redirect("/?demo=failed", 303);
    return redirectWithCookies(landing, signIn);
  } catch (e) {
    if (e instanceof DemoUnavailable) return redirect("/?demo=busy", 303);
    console.error("Demo could not be built", e);
    return redirect("/?demo=failed", 303);
  }
};

export const GET: APIRoute = ({ redirect }) => redirect("/", 302);
