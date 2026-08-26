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
]);

export default eslintConfig;
