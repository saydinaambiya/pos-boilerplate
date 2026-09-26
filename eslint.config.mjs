import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const injectionGuards = [
  {
    selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
    message: "sql.raw bypasses parameterization (PRD NFR-SEC-03).",
  },
  {
    selector: "MemberExpression[property.name='innerHTML']",
    message: "Writing innerHTML enables script injection (PRD NFR-SEC-04).",
  },
];

const hexColorGuards = [
  {
    selector: "Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
    message: "Use semantic color tokens instead of hex values (PRD FR-UI-01).",
  },
  {
    selector: "TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
    message: "Use semantic color tokens instead of hex values (PRD FR-UI-01).",
  },
];

/**
 * Lint policy: see docs/PRD.md NFR-CODE-02 (strict typed linting),
 * NFR-SEC-03/04 (injection guards) and FR-UI-01/10 (tokens & i18n).
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "react/no-danger": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-syntax": ["error", ...injectionGuards],
    },
  },
  {
    files: ["src/components/**/*.tsx", "src/features/**/*.tsx", "src/app/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: false, allowedStrings: ["·", "/", "—", "|", "%", "+", "-", ":", "*"] },
      ],
      "no-restricted-syntax": ["error", ...injectionGuards, ...hexColorGuards],
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
