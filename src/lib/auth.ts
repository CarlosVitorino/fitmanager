import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { adminAc, memberAc, ownerAc } from "better-auth/plugins/organization/access";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { env } from "./env";

/**
 * Studio = Better Auth organization. Roles inside a studio:
 *  - owner: runs the studio, full control
 *  - coach: manages classes, members and credits
 *  - member: books classes and sees their own data
 * Better Auth stores memberships; what each role may do in FitManager is
 * decided in src/server/authz.ts, not here.
 */
export const auth = betterAuth({
  baseURL: env().BETTER_AUTH_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema, camelCase: false }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  plugins: [
    organization({
      creatorRole: "owner",
      roles: { owner: ownerAc, coach: adminAc, member: memberAc },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
