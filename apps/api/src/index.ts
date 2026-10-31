import { createServer } from "node:http";
import { createPool } from "@idea-radar/db";
import { createApi } from "./app.js";

const port = Number(process.env.API_PORT ?? 4000);
const server = createServer(createApi(createPool()));

server.listen(port, () => console.log(`api listening on :${port}`));
