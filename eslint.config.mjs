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
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Cloudflare Workers runtime: fetch/Response/URL are ambient, there is no `require`.
    files: ["workers/**/*.js"],
    languageOptions: {
      globals: {
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        crypto: "readonly",
        console: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.cjs", "scripts/**/*.mjs", "scripts/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
