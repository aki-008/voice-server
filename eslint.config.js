import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/", "dist/", "dist-server/", "coverage/", "vendor/", "models/"],
  },

  // Config files (Node, ESM).
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },

  // Server (Node + TypeScript).
  {
    files: ["server/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Client (browser + TypeScript).
  {
    files: ["src/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
);
