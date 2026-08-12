import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .claude holds agent worktrees — nested repo copies whose paths defeat the
  // root-anchored overrides below and double-lint everything.
  { ignores: ["dist", "node_modules", "coverage", ".claude"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // react-three-fiber is an imperative, mutation-driven world; the react
    // compiler's immutability rules do not apply to per-frame scene graph work.
    files: ["src/book3d/**/*.tsx", "src/book3d/**/*.ts"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/use-memo": "off",
    },
  },
);
