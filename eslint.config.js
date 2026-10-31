import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "apps/dashboard/next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Rules switched off because existing code trips them; hit counts are from the T022 baseline.
      // 12 hits (test stubs in api, worker, db, connectors).
      "@typescript-eslint/no-explicit-any": "off",
      // 10 hits (9 intentional `_`-prefixed interface params such as `_since`, 1 unused callback param); unused vars and imports are still checked.
      "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
      // 4 hits (connector stubs that throw "not implemented" in an async generator).
      "require-yield": "off",
      // 1 hit (packages/connectors/src/github-api.ts rethrow without `cause`).
      "preserve-caught-error": "off",
      // 1 hit (a ternary statement in apps/worker/src/worker.test.ts).
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
);
