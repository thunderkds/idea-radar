import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { IdeaFile } from "./types.js";

// ajv and ajv-formats are CommonJS; under NodeNext the constructor/function sits on `.default`.
const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;

// The one schema file, shared with the routine. Resolves to <repo>/ideas/schema.json from src/ and dist/.
const schemaUrl = new URL("../../../ideas/schema.json", import.meta.url);

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateSchema = ajv.compile(JSON.parse(readFileSync(schemaUrl, "utf8")));

export type ValidationResult = { ok: true; file: IdeaFile } | { ok: false; errors: string[] };

/** Validate parsed JSON against ideas/schema.json. Every error names `fileName` and the JSON path of the field. */
export function validateIdeaFile(json: unknown, fileName: string): ValidationResult {
  if (!validateSchema(json)) {
    const errors = (validateSchema.errors ?? []).map((e) => {
      const extra = e.keyword === "additionalProperties" ? ` "${e.params.additionalProperty}"` : "";
      const path = e.instancePath === "" ? "/" : e.instancePath;
      return `${fileName}: ${path} ${e.message}${extra}`;
    });
    return { ok: false, errors };
  }
  const file = json as IdeaFile;
  const errors: string[] = [];
  const firstAt = new Map<string, number>();
  file.ideas.forEach((idea, i) => {
    const first = firstAt.get(idea.id);
    if (first === undefined) firstAt.set(idea.id, i);
    else errors.push(`${fileName}: /ideas/${i}/id duplicates /ideas/${first}/id ("${idea.id}")`);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, file };
}
