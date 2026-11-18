import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * FitManager settings for a studio (1:1 with organization).
 * Kept apart from the Better Auth table so auth upgrades never touch it.
 */
export const studioSettings = pgTable("studio_settings", {
  studioId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** IANA timezone; class dates, expiry and settlement are computed in it. */
  timezone: text().notNull().default("UTC"),
  /** Members can book until this many minutes before a class starts. */
  bookingCutoffMinutes: integer().notNull().default(120),
  /** Cancelling later than this many minutes before start keeps the credit spent. */
  cancellationCutoffMinutes: integer().notNull().default(1440),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
