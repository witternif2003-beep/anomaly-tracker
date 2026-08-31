import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

// eslint-config-next 16.3.2 is installed but cannot drive ESLint 10.9.0 yet
// (eslint-plugin-react still calls removed context.getFilename; Next's Babel
// parser lacks scopeManager.addGlobals). Closest working substitute: ESLint 10
// + typescript-eslint 8.68 on the TypeScript 6 API alias.
const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "vendor/**",
    "wh-tracker/**",
    "wh-tracker-vercel/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Repo tooling under scripts/ runs in Node, not the browser.
    files: ["scripts/**/*.{js,cjs,mjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        fetch: "readonly",
        __dirname: "readonly",
        require: "readonly",
        module: "writable",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
