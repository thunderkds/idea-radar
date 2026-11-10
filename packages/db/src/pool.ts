import pg from "pg";

/** One shared pool per process. A dropped idle connection must not crash the process, so errors are logged. */
export function createPool(url: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: url });
  pool.on("error", (err) => console.error("postgres pool error:", err.message));
  return pool;
}

/** Run `fn` inside BEGIN/COMMIT on one connection; any throw rolls back and is rethrown. */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch((e: Error) => {
      broken = e; // the connection is unusable: destroy it instead of returning it to the pool
    });
    throw err;
  } finally {
    client.release(broken);
  }
}
