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
      // Disabled: too aggressive with Convex reactive queries and defensive coding
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      // Disabled: Convex queries return untyped data; fixing requires schema-wide typing
      // that adds boilerplate without runtime safety benefit (Convex validates server-side)
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",

      // === Code Complexity ===
      "max-lines-per-function": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines": ["warn", { max: 700, skipBlankLines: true, skipComments: true }],
      complexity: ["warn", { max: 25 }],
      "max-depth": ["warn", { max: 5 }],
      "max-params": ["warn", { max: 5 }],

      // === React Best Practices ===
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-key": ["error", { checkFragmentShorthand: true }],
      // Disabled: all index-key usages are prefixed with stable parent context
      // (e.g. `${roleId}-action-${i}`) for static/append-only lists.
      "react/no-array-index-key": "off",
      "react/self-closing-comp": "warn",
      "react/no-unstable-nested-components": "warn",

      // === General ===
      "prefer-const": "error",
      "no-var": "error",
      "prefer-template": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["log", "warn", "error", "info"] }],
      // Nested ternaries are idiomatic in JSX conditional rendering
      "no-nested-ternary": "off",

      // === Browser API restrictions ===
      // Native dialogs (alert/confirm/prompt) block the event loop and break
      // browser extensions. Use inline React UI confirmations instead.
      "no-restricted-globals": ["error", "alert", "confirm", "prompt"],
    },
  },

  // API routes — complex orchestrators that are hard to decompose further
  {
    files: [
      "**/app/api/ai-player/route.ts",
      "**/app/api/ai-proposals/route.ts",
      "**/app/api/facilitator-adjust/route.ts",
    ],
    rules: {
      complexity: "off",
      "max-depth": "off",
    },
  },

  // Large page components — monolithic by design (state + layout + handlers)
  {
    files: [
      "**/game/*/facilitator/page.tsx",
      "**/game/*/table/*/page.tsx",
    ],
    rules: {
      "max-lines-per-function": "off",
      "max-lines": "off",
      complexity: "off",
    },
  },

  // Components with inherently high branching (debug/lobby views)
  {
    files: [
      "**/components/debug-panel.tsx",
      "**/components/facilitator/lobby-phase.tsx",
      "**/components/action-input.tsx",
    ],
    rules: {
      complexity: "off",
    },
  },

  // Test & script files — relax rules that add noise without safety benefit
  {
    files: ["tests/**", "scripts/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "max-lines": "off",
      "max-lines-per-function": "off",
      complexity: "off",
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
