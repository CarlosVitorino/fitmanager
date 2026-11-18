import { t } from "../i18n";
/** The coach booking controls, shared by the class page and the member page. */
import * as bookings from "./bookings";
import { bool, str, type ActionHandler } from "./actions";
import type { StudioContext } from "./studio-context";

export function bookingActions(ctx: StudioContext): Record<string, ActionHandler> {
  return {
    noShow: async (f) => {
      const value = bool(f, "value");
      await bookings.setNoShow(ctx, str(f, "bookingId"), value);
      return value ? t("booking.flash.noShowOn") : t("booking.flash.noShowOff");
    },
    charge: async (f) => {
      const value = bool(f, "value");
      await bookings.setBookingCharged(ctx, str(f, "bookingId"), value);
      return value ? t("booking.flash.charged") : t("booking.flash.waived");
    },
    remove: async (f) => {
      await bookings.removeBooking(ctx, str(f, "bookingId"));
      return t("booking.flash.removed");
    },
    move: async (f) => {
      await bookings.moveBooking(ctx, str(f, "bookingId"), str(f, "toSessionId"));
      return t("booking.flash.moved");
    },
  };
}
