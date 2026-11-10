import { fileURLToPath } from "node:url";
import { startServer } from "./server.js";

// Same relative depth from src/ and from dist/, so the default finds the repo's ideas/ in both.
const DEFAULT_IDEAS_DIR = fileURLToPath(new URL("../../../ideas", import.meta.url));

const port = process.env.PORT === undefined || process.env.PORT === "" ? 8080 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("PORT must be a whole number from 0 to 65535");
  process.exit(1);
}

try {
  const { port: listening } = await startServer({
    token: process.env.MCP_TOKEN ?? "",
    ideasDir: process.env.IDEAS_DIR || DEFAULT_IDEAS_DIR,
    port,
  });
  console.log(`listening on port ${listening}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
