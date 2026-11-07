import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  { ignores: ["**/dist/", "build/", "export/", "**/node_modules/", ".rea-evidence/"] },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  { languageOptions: { globals: { ...globals.node } } },
  {
    // Preloads and local pages run in the renderer.
    files: ["{packages/,}core/src/preload/**/*.js", "{packages/,}core/static/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  pluginJs.configs.recommended,
  {
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
