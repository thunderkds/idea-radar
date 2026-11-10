import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Rules switched off because existing code trips them.
      // Test stubs and fixtures use `any` (e.g. packages/ideas/src/validate.test.ts).
      "@typescript-eslint/no-explicit-any": "off",
      // Intentional `_`-prefixed interface params; unused vars and imports are still checked.
      "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
    },
  },
);
