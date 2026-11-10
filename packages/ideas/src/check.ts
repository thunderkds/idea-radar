import { join } from "node:path";
import { readIdeaDir } from "./load.js";

/** Validate every idea file in `ideasDir` and `ideasDir/examples`. `lines` holds one error per line. */
export function checkIdeaDirs(ideasDir: string): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  for (const dir of [ideasDir, join(ideasDir, "examples")]) {
    for (const s of readIdeaDir(dir).skipped) lines.push(...s.reason.split("\n"));
  }
  return { ok: lines.length === 0, lines };
}
