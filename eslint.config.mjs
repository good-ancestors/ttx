import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "convex/_generated/**",
  ]),

  // Type-aware linting for TS/TSX files
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // === TypeScript Best Practices ===
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // === Type-Aware Rules (catch real runtime bugs) ===
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",

      // === Code Complexity ===
      "max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      complexity: ["warn", { max: 20 }],
      "max-depth": ["warn", { max: 5 }],
      "max-params": ["warn", { max: 5 }],

      // === React Best Practices ===
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-key": ["error", { checkFragmentShorthand: true }],
      "react/no-array-index-key": "warn",
      "react/self-closing-comp": "warn",
      "react/no-unstable-nested-components": "warn",

      // === General ===
      "prefer-const": "error",
      "no-var": "error",
      "prefer-template": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["log", "warn", "error", "info"] }],
      "no-nested-ternary": "warn",
    },
  },

  // Convex functions — relax some rules that conflict with Convex patterns
  {
    files: ["convex/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "max-lines-per-function": "off",
    },
  },
]);

export default eslintConfig;
