/** Human labels for domain values, in the request's language. */
import type { Validity } from "../domain/packs";
import { t } from "../i18n";
import { plural } from "../lib/format";

export function validityLabel(validity: Validity): string {
  if (!validity) return t("setup.plans.neverExpires");
  const unit = validity.unit === "days" ? "days" : validity.unit === "weeks" ? "weeks" : "months";
  return t("setup.plans.validLabel", { duration: plural(validity.amount, unit) });
}
