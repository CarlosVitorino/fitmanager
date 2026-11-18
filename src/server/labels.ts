/** Human labels for domain values, in the request's language. */
import type { Validity } from "../domain/packs";
import { t } from "../i18n";
import { plural } from "../lib/format";
import type { MessageKey } from "../i18n";
import { GOALS } from "./profiles";

export function validityLabel(validity: Validity): string {
  if (!validity) return t("setup.plans.neverExpires");
  const unit = validity.unit === "days" ? "days" : validity.unit === "weeks" ? "weeks" : "months";
  return t("setup.plans.validLabel", { duration: plural(validity.amount, unit) });
}

/** "Cash", "Bar", "Efectivo"… for a stored payment method. */
export function paymentMethodLabel(method: string): string {
  switch (method) {
    case "cash":
      return t("members.payments.methods.cash");
    case "card":
      return t("members.payments.methods.card");
    case "transfer":
      return t("members.payments.methods.transfer");
    default:
      return t("members.payments.methods.otherMethod");
  }
}

/** Built-in goals are stored in English and shown translated; custom goals are shown as written. */
export function goalLabel(goal: string): string {
  return (GOALS as readonly string[]).includes(goal) ? t(`profile.goals.${goal}` as MessageKey) : goal;
}

export function noteCategoryLabel(category: string): string {
  return t(`profile.notes.categories.${category}` as MessageKey);
}

export function experienceLabel(level: string): string {
  return t(`profile.experience.${level}` as MessageKey);
}

export function clearanceLabel(status: string): string {
  return t(`profile.clearance.${status}` as MessageKey);
}

export function metricLabel(key: string): string {
  return t(`profile.metrics.${key}` as MessageKey);
}

export function unitLabel(unit: string): string {
  return t(`profile.units.${unit}` as MessageKey);
}
