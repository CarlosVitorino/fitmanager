import { auditLog } from "../db/schema";
import type { StudioContext } from "./studio-context";
import type { Executor } from "./tx";

export type AuditAction =
  | "plan.assigned"
  | "credits.adjusted"
  | "booking.added"
  | "booking.removed"
  | "booking.moved"
  | "booking.charge_changed"
  | "booking.no_show_changed"
  | "session.cancelled"
  | "session.updated"
  | "member.role_changed"
  | "member.removed"
  | "payment.recorded"
  | "payment.deleted"
  | "settings.updated"
  | "invite.regenerated";

export async function audit(
  tx: Executor,
  ctx: StudioContext,
  action: AuditAction,
  memberId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(auditLog).values({ studioId: ctx.studioId, actorId: ctx.userId, memberId, action, details });
}
