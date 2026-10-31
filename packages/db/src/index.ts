import pg from "pg";

// pg returns BIGINT (int8) and NUMERIC as strings by default. repo_id and every count here fit in a
// JS number (< 2^53), and scores are small decimals, so parse them to numbers once, for the whole process.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export type Pool = InstanceType<typeof pg.Pool>;
export type PoolClient = pg.PoolClient;
/** Anything the data-access functions can run on: a pool, or a client inside the caller's transaction. */
export type Queryable = Pool | PoolClient;

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new pg.Pool({ connectionString });
}

export { applyMigrations } from "./migrations.js";
export * from "./repository.js";
export * from "./sources.js";
export * from "./candidates.js";
export * from "./content.js";
export * from "./jobs.js";
export * from "./api.js";
export * from "./scores.js";
export * from "./consensus.js";
