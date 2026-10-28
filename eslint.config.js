import js from "@eslint/js";
import globals from "globals";

export default [
  // 1. Inherit standard JavaScript recommended rules
  js.configs.recommended,

  {
    // 2. Target your backend files
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module", // Use "commonjs" if you are using require() instead of import
      globals: {
        ...globals.node, // Injects standard Node.js globals like process, __dirname, etc.
      },
    },

    // 3. Define exceptions or custom rules for your Express app
    rules: {
      "no-console": "off", // Allows console.log for server logging
      "no-unused-vars": ["warn", { 
        "argsIgnorePattern": "^_", 
        "varsIgnorePattern": "^_" 
      }], // Stops ESLint from yelling about unused 'next' middleware parameters
    },
  },
  
  // 4. Global ignores (replaces the old .eslintignore file)
  {
    ignores: ["node_modules/", "dist/", "coverage/"],
  }
];
