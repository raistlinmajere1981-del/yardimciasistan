import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const commonGlobals = {
  ...globals.browser,
  ...globals.node
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-renderer/**",
      "**/dist-electron/**",
      "**/build/**",
      "**/coverage/**",
      "**/.demo-runtime/**",
      "**/release/**",
      // Only the hand-written web-module scripts are linted. widget.js is a
      // tracked build snapshot of packages/web-widget (linted at its source)
      // and widget-core.js is a minified bundle, so both stay out of scope.
      "firm-template/web-module/widget.js",
      "firm-template/web-module/widget-core.js",
      "demo-data/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      globals: commonGlobals
    },
    rules: {
      "no-console": "off",
      "no-constant-condition": ["error", { "checkLoops": false }],
      // Control-character regexes are intentional input sanitizers in the
      // desktop and hosting tooling. ESLint cannot distinguish them from
      // accidental literal control characters.
      "no-control-regex": "off",
      // Transaction-style code frequently declares a result before try/catch
      // and assigns it only on the successful path. TypeScript already checks
      // the actual use sites; this newer ESLint rule creates mostly noise here.
      "no-useless-assignment": "off",
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "prefer-const": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { "allowInterfaces": "with-single-extends" }
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrors": "none"
        }
      ]
    }
  },
  {
    files: ["**/*.cjs", "**/tests/**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      // The package tests deliberately exercise the compiled CommonJS output.
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    files: [
      "apps/desktop-app/src/**/*.{ts,tsx}",
      "packages/web-widget/**/*.{ts,tsx}"
    ],
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      // Keep the two mature hook correctness checks. The broader React Hooks
      // recommended preset now also includes compiler-oriented rules such as
      // set-state-in-effect/refs/immutability; those are useful migration
      // diagnostics but too opinionated to be repository gates for this app.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error"
    }
  },
  {
    // Promise correctness gates. Scoped to tsconfig-covered sources;
    // scripts/tests fixtures live outside every project and would
    // otherwise fail type-aware parsing.
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    ignores: ["apps/desktop-app/scripts/**"],
    languageOptions: {
      parserOptions: {
        project: [
          "./apps/admin-control-center/tsconfig.json",
          "./apps/admin-control-center/tsconfig.electron.json",
          "./apps/desktop-app/tsconfig.json",
          "./apps/desktop-app/tsconfig.electron.json",
          "./packages/shared/tsconfig.json",
          "./packages/sync-core/tsconfig.json",
          "./packages/ai-core/tsconfig.json",
          "./packages/whatsapp-bridge/tsconfig.json",
          "./packages/web-widget/tsconfig.json"
        ],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { "considerDefaultExhaustiveForUnions": true }
      ]
    }
  }
);
