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
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ]
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
      ...reactHooks.configs.recommended.rules
    }
  }
);
