/**
 * Stack tags from repo manifests (T008). `manifests` maps a file name at the repo root to its text.
 * One table maps a dependency to a tag; each manifest kind also gives a language tag.
 * Nothing here throws: a manifest that does not parse contributes no tags.
 */

type Kind = "node" | "python" | "go" | "rust" | "java";

export const MANIFEST_FILES = [
  "package.json",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
] as const;

const KIND_OF: Record<(typeof MANIFEST_FILES)[number], Kind> = {
  "package.json": "node",
  "go.mod": "go",
  "pyproject.toml": "python",
  "requirements.txt": "python",
  "Cargo.toml": "rust",
  "pom.xml": "java",
  "build.gradle": "java",
};

/** The one dependency table: [tag, ecosystem, matches a normalized dependency name]. */
const DEPENDENCY_TAGS: [tag: string, kind: Kind, match: RegExp][] = [
  ["next", "node", /^next$/],
  ["react", "node", /^react$/],
  ["vue", "node", /^vue$/],
  ["svelte", "node", /^svelte$/],
  ["express", "node", /^express$/],
  ["fastapi", "python", /^fastapi$/],
  ["django", "python", /^django$/],
  ["flask", "python", /^flask$/],
  ["tokio", "rust", /^tokio$/],
  ["axum", "rust", /^axum$/],
  ["gin", "go", /^github\.com\/gin-gonic\/gin$/],
  ["spring", "java", /^(org\.springframework(\.|$)|spring-)/],
];

/** Dependency names of a `package.json`, or null when it is not a JSON object. */
function nodeDeps(text: string): string[] | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const out: string[] = [];
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = (json as Record<string, unknown>)[field];
    if (typeof deps === "object" && deps !== null && !Array.isArray(deps)) out.push(...Object.keys(deps));
  }
  return out;
}

/** `requirements.txt`: the leading package name of each line, without extras or version specifiers. */
function requirementsDeps(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(raw.replace(/#.*/, ""));
    if (m) out.push(m[1]!);
  }
  return out;
}

/**
 * Line-based reading of TOML, enough for dependency names. Collects the keys under a table whose name
 * ends in `dependencies` (and the name in `[...dependencies.<name>]`), plus quoted requirement strings
 * in a `dependencies = [ ... ]` array (PEP 621). Not a validating parser.
 */
function tomlDeps(text: string): string[] {
  const out: string[] = [];
  let table = "";
  let inArray = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s#.*$/, "").trim();
    if (inArray) {
      for (const m of line.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)/g)) out.push(m[1]!);
      if (line.includes("]")) inArray = false;
      continue;
    }
    const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (header) {
      table = header[1]!;
      const sub = /(?:^|\.)(?:dev-|build-)?dependencies\.([A-Za-z0-9._-]+)$/.exec(table);
      if (sub) out.push(sub[1]!);
      continue;
    }
    const key = /^([A-Za-z0-9._-]+|"[^"]+")\s*=\s*(.*)$/.exec(line);
    if (!key) continue;
    const name = key[1]!.replace(/"/g, "");
    if (/(?:^|\.)(?:[\w-]*-)?dependencies$/.test(table)) out.push(name);
    else if (name === "dependencies" || name.endsWith("-dependencies")) {
      for (const m of key[2]!.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)/g)) out.push(m[1]!);
      if (key[2]!.includes("[") && !key[2]!.includes("]")) inArray = true;
    }
  }
  return out;
}

/** `go.mod`: module paths in `require` lines and blocks. */
function goDeps(text: string): string[] {
  const out: string[] = [];
  let block = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (block) {
      if (line.startsWith(")")) block = false;
      else if (line) out.push(line.split(/\s+/)[0]!);
    } else if (/^require\s*\(/.test(line)) block = true;
    else {
      const one = /^require\s+(\S+)/.exec(line);
      if (one) out.push(one[1]!);
    }
  }
  return out;
}

/** `pom.xml` group and artifact ids; `build.gradle` `group:artifact` strings. */
function javaDeps(file: string, text: string): string[] {
  const out: string[] = [];
  if (file === "pom.xml") {
    for (const m of text.matchAll(/<(?:groupId|artifactId)>\s*([^<\s]+)\s*</g)) out.push(m[1]!);
  } else {
    for (const m of text.matchAll(/["']([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)(?::[^"']*)?["']/g)) out.push(m[1]!, m[2]!);
    for (const m of text.matchAll(/group:\s*["']([^"']+)["']/g)) out.push(m[1]!);
  }
  return out;
}

/** Normalized dependency names for one manifest, or null when it cannot be read. */
function depsOf(file: (typeof MANIFEST_FILES)[number], text: string): string[] | null {
  switch (file) {
    case "package.json":
      return nodeDeps(text);
    case "requirements.txt":
      return requirementsDeps(text);
    case "pyproject.toml":
    case "Cargo.toml":
      return tomlDeps(text);
    case "go.mod":
      return goDeps(text);
    default:
      return javaDeps(file, text);
  }
}

/** Sorted, unique stack tags for the manifests found at a repo root. Never throws. */
export function deriveStackTags(manifests: Record<string, unknown>): string[] {
  const tags = new Set<string>();
  for (const file of MANIFEST_FILES) {
    const text = manifests[file];
    if (typeof text !== "string") continue;
    const kind = KIND_OF[file];
    let deps: string[] | null;
    try {
      deps = depsOf(file, text);
    } catch {
      deps = null;
    }
    if (deps === null) continue;
    tags.add(kind);
    // Python names are case-insensitive and treat `_` and `-` alike.
    const names = deps.map((d) => (kind === "python" ? d.toLowerCase().replace(/_/g, "-") : d));
    for (const [tag, depKind, match] of DEPENDENCY_TAGS) {
      if (depKind === kind && names.some((n) => match.test(n))) tags.add(tag);
    }
  }
  return [...tags].sort();
}
