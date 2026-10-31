import pg from "pg";

export type Pool = InstanceType<typeof pg.Pool>;

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new pg.Pool({ connectionString });
}
