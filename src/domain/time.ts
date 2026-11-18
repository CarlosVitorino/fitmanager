/** Minutes between `now` and `start`. Negative once the class has started. */
export function minutesUntil(start: Date, now: Date): number {
  return Math.floor((start.getTime() - now.getTime()) / 60_000);
}

/** Members can book while the class is at least `cutoffMinutes` away. */
export function isBookingOpen(start: Date, now: Date, cutoffMinutes: number): boolean {
  return minutesUntil(start, now) >= cutoffMinutes;
}

/** Cancelling returns the credit only while the class is at least `cutoffMinutes` away. */
export function isFreeCancellation(start: Date, now: Date, cutoffMinutes: number): boolean {
  return minutesUntil(start, now) >= cutoffMinutes;
}
