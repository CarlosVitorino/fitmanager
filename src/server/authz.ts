import { forbidden } from "./errors";

export const ROLES = ["owner", "coach", "member"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * What each studio role may do. The single place FitManager permissions are decided.
 * Server actions check a capability, never a role name directly.
 */
const CAPABILITIES = {
  "studio:settings": ["owner"],
  "staff:manage": ["owner"],
  "members:view": ["owner", "coach"],
  "members:manage": ["owner", "coach"],
  "credits:manage": ["owner", "coach"],
  "calendar:manage": ["owner", "coach"],
  "notes:private": ["owner", "coach"],
  "bookings:self": ["owner", "coach", "member"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

export function assertCan(role: Role, capability: Capability): void {
  if (!can(role, capability)) throw forbidden();
}

export function isStaff(role: Role): boolean {
  return role === "owner" || role === "coach";
}
