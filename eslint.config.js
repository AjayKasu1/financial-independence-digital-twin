import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/.wrangler/**",
      "node_modules/**",
      "eslint.config.js"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true }
      ]
    }
  },
  {
    files: ["**/*.config.ts", "vite.config.ts", "vitest.config.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off"
    }
  }
);
