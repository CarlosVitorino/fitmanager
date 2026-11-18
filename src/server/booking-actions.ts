/** The coach booking controls, shared by the class page and the member page. */
import * as bookings from "./bookings";
import { bool, str, type ActionHandler } from "./actions";
import type { StudioContext } from "./studio-context";

export function bookingActions(ctx: StudioContext): Record<string, ActionHandler> {
  return {
    noShow: async (f) => {
      const value = bool(f, "value");
      await bookings.setNoShow(ctx, str(f, "bookingId"), value);
      return value ? "Marked as no-show. The credit is still used unless you waive it." : "No-show removed.";
    },
    charge: async (f) => {
      const value = bool(f, "value");
      await bookings.setBookingCharged(ctx, str(f, "bookingId"), value);
      return value ? "Credit charged." : "Credit waived and given back.";
    },
    remove: async (f) => {
      await bookings.removeBooking(ctx, str(f, "bookingId"));
      return "Booking removed. The credit went back to the member.";
    },
    move: async (f) => {
      await bookings.moveBooking(ctx, str(f, "bookingId"), str(f, "toSessionId"));
      return "Booking moved.";
    },
  };
}
