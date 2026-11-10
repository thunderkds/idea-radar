import { fileURLToPath } from "node:url";
import { checkIdeaDirs } from "./check.js";
import { readIdeaDir } from "./load.js";

// `pnpm ideas:check [dir]` — default dir is <repo>/ideas. Exit 1 on any invalid file.
const dir = process.argv[2] ?? fileURLToPath(new URL("../../../ideas", import.meta.url));
const { ok, lines } = checkIdeaDirs(dir);
for (const line of lines) console.error(line);
if (ok) console.log(`ideas:check ok (${readIdeaDir(dir).files.length} idea file(s) in ${dir})`);
process.exit(ok ? 0 : 1);
