import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: ["dist/**", "node_modules/**", ".env"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
        plugins: {
            prettier: prettierPlugin,
        },
        rules: {
            "prettier/prettier": "error",
        },
    },
    prettierConfig,
];
