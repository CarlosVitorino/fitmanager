import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/", ".astro/", "node_modules/", "drizzle/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    // The domain module stays framework-free: no UI, database, auth or server imports.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "astro",
                "astro:*",
                "react",
                "react-dom",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
                "better-auth",
                "better-auth/*",
              ],
              message: "src/domain must stay framework-free.",
            },
            {
              group: ["**/db/**", "**/server/**", "**/lib/**", "**/pages/**", "**/components/**"],
              message: "src/domain must not depend on app layers.",
            },
          ],
        },
      ],
    },
  },
);
