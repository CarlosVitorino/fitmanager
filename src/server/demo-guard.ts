/**
 * Demo people have addresses in a reserved domain. Only the demo builder may create them, so nobody
 * can sign up with a demo-looking address and pass for (or end) someone else's demo.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export const DEMO_EMAIL_DOMAIN = "demo.fitmanager.invalid";
const building = new AsyncLocalStorage<true>();

export function asDemoBuilder<T>(fn: () => Promise<T>): Promise<T> {
  return building.run(true, fn);
}

export function mayCreateUser(email: string): boolean {
  return !email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`) || building.getStore() === true;
}
