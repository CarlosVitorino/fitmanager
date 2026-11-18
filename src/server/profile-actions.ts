/** Form handlers for profiles, shared by the member's own pages and the coach's member page. */
import { optStr, str, type ActionHandler } from "./actions";
import { personalInput, savePersonal } from "./profiles";
import type { StudioContext } from "./studio-context";

export function personalAction(ctx: StudioContext, memberId: string): ActionHandler {
  return async (f) => {
    await savePersonal(
      ctx,
      memberId,
      personalInput.parse({
        name: str(f, "name"),
        phone: optStr(f, "phone"),
        dateOfBirth: optStr(f, "dateOfBirth"),
        gender: optStr(f, "gender"),
        addressLine: optStr(f, "addressLine"),
        city: optStr(f, "city"),
        postalCode: optStr(f, "postalCode"),
        country: optStr(f, "country"),
        emergencyName: optStr(f, "emergencyName"),
        emergencyPhone: optStr(f, "emergencyPhone"),
      }),
    );
    return "Details saved.";
  };
}
