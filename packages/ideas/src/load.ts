import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_VERSION } from "./types.js";
import type { IdeaFile, LoadResult, MergedIdea, SkippedFile } from "./types.js";
import { validateIdeaFile } from "./validate.js";

export const MAX_FILE_BYTES = 1024 * 1024;

export interface ReadResult {
  /** Valid files, sorted by file name. */
  files: { name: string; file: IdeaFile }[];
  /** Everything else, sorted by file name, each with a reason that names the file (and field). */
  skipped: SkippedFile[];
}

/** Read and validate every `*.json` directly under `dir` (not sub-directories, not `schema.json`). Never throws on bad content. */
export function readIdeaDir(dir: string): ReadResult {
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".json") && e.name !== "schema.json")
      .map((e) => e.name)
      .sort(compare);
  } catch (err) {
    // Only a missing directory means "no ideas yet"; any other error (permissions, not a directory) must surface.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { files: [], skipped: [] };
    throw err;
  }
  const files: ReadResult["files"] = [];
  const skipped: SkippedFile[] = [];
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).size > MAX_FILE_BYTES) {
      skipped.push({ file: name, reason: `${path}: larger than 1 MB, not read` });
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      skipped.push({ file: name, reason: `${path}: invalid JSON (${(err as Error).message})` });
      continue;
    }
    const version = (json as { schema_version?: unknown } | null)?.schema_version;
    if (typeof version === "number" && version !== SCHEMA_VERSION) {
      skipped.push({
        file: name,
        reason: `${path}: unsupported schema_version ${version} (this loader reads ${SCHEMA_VERSION})`,
      });
      continue;
    }
    const result = validateIdeaFile(json, path);
    if (result.ok) files.push({ name, file: result.file });
    else skipped.push({ file: name, reason: result.errors.join("\n") });
  }
  return { files, skipped };
}

/** Merge all valid idea files in `dir` by `id`: latest `date` wins; same date, the file name that sorts last. */
export function loadIdeas(dir: string): LoadResult {
  const { files, skipped } = readIdeaDir(dir);
  // Oldest first, so a later entry always overwrites an earlier one: the result is independent of readdir order.
  const ordered = [...files].sort((a, b) => compare(a.file.date, b.file.date) || compare(a.name, b.name));
  const merged = new Map<string, MergedIdea>();
  for (const { name, file } of ordered) {
    for (const idea of file.ideas) {
      const prev = merged.get(idea.id);
      merged.set(idea.id, {
        ...idea,
        first_seen: prev?.first_seen ?? file.date,
        last_seen: file.date,
        files: [...(prev?.files ?? []), name],
      });
    }
  }
  const ideas = [...merged.values()].map((i) => ({ ...i, files: [...i.files].sort(compare) }));
  ideas.sort((a, b) => compare(a.id, b.id));
  return { ideas, skipped };
}

// Plain code-unit comparison: locale-independent, so the same files always sort the same way.
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
