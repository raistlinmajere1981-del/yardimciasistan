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
      "firm-template/**",
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
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
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
      "apps/demo-web/src/**/*.{ts,tsx}",
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
      "react-hooks/exhaustive-deps": "warn"
    }
  }
);
