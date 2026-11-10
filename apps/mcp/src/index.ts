import { startServer } from "./server.js";

const port = process.env.PORT === undefined || process.env.PORT === "" ? 8080 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("PORT must be a whole number from 0 to 65535");
  process.exit(1);
}

try {
  const { port: listening } = await startServer({
    databaseUrl: process.env.DATABASE_URL ?? "",
    token: process.env.MCP_TOKEN ?? "",
    writeToken: process.env.MCP_WRITE_TOKEN ?? "",
    dashboardToken: process.env.DASHBOARD_TOKEN ?? "",
    port,
  });
  console.log(`listening on port ${listening}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
