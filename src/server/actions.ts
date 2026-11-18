import type { AstroGlobal } from "astro";
import { ZodError } from "zod";
import { t } from "../i18n";
import { HttpError } from "./errors";

export type ActionHandler = (form: FormData) => Promise<string | void | Response>;

export interface ActionResult {
  error: string | null;
  flash: string | null;
  /** The form that failed, so its values can be shown again. */
  failedForm: FormData | null;
}

const FLASH = "fm_flash";

/**
 * Server-side form handling for pages. A POST carries `_action`; the matching handler runs.
 * Success → redirect back (303) with a flash message. Known errors → shown on the page.
 * GET → returns the pending flash message, if any.
 */
export async function handleActions(
  Astro: AstroGlobal,
  handlers: Record<string, ActionHandler>,
): Promise<ActionResult | Response> {
  const flash = Astro.cookies.get(FLASH)?.value ?? null;
  if (flash) Astro.cookies.delete(FLASH, { path: "/" });
  if (Astro.request.method !== "POST")
    return { error: null, flash: flash && decodeURIComponent(flash), failedForm: null };

  const form = await Astro.request.formData();
  const name = String(form.get("_action") ?? "");
  const handler = handlers[name];
  if (!handler) return { error: t("errors.unknownAction"), flash: null, failedForm: form };
  try {
    const result = await handler(form);
    if (result instanceof Response) return result;
    if (result)
      Astro.cookies.set(FLASH, encodeURIComponent(result), { path: "/", maxAge: 60, httpOnly: true, sameSite: "lax" });
    const back = String(form.get("_redirect") ?? "") || Astro.url.pathname + Astro.url.search;
    return Astro.redirect(back.startsWith("/") && !back.startsWith("//") ? back : Astro.url.pathname, 303);
  } catch (e) {
    if (e instanceof HttpError) {
      Astro.response.status = e.status;
      return { error: e.message, flash: null, failedForm: form };
    }
    if (e instanceof ZodError) {
      Astro.response.status = 400;
      return { error: e.issues[0]?.message ?? t("errors.checkForm"), flash: null, failedForm: form };
    }
    throw e;
  }
}

/* Form field readers. They throw a 400 with a readable message on bad input. */

export function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export function optStr(form: FormData, key: string): string | null {
  return str(form, key) || null;
}

export function int(form: FormData, key: string, label = key): number {
  const raw = str(form, key);
  const n = Number(raw);
  if (raw === "" || !Number.isInteger(n)) throw new HttpError(400, t("errors.wholeNumber", { label }));
  return n;
}

export function optInt(form: FormData, key: string, label = key): number | null {
  return str(form, key) === "" ? null : int(form, key, label);
}

/** "12", "12.5", "12,50" → cents. Empty → null. */
export function money(form: FormData, key: string): number | null {
  const raw = str(form, key).replace(",", ".");
  if (raw === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new HttpError(400, t("errors.amount"));
  return Math.round(Number(raw) * 100);
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** "70.5" or "70,5" → 70.5. Empty → null. */
export function decimal(form: FormData, key: string, label = key): number | null {
  const raw = str(form, key).replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new HttpError(400, t("errors.number", { label }));
  return n;
}
