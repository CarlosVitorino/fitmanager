import { db } from "../db/client";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Either the db or an open transaction. */
export type Executor = typeof db | Tx;

export { db };
