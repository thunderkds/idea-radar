/** Parse `--name value` pairs; a bare `--` (which pnpm passes through) is ignored. */
export function parseArgs(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") continue;
    if (!a.startsWith("--")) throw new Error(`unexpected argument "${a}"`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${a}`);
    out[a.slice(2)] = value;
    i++;
  }
  return out;
}
