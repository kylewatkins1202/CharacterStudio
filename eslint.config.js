const { defineConfig } = require("eslint/config")

const rules = {
    semi: ["warn", "never"],
    "no-var": "warn",
    "no-const-assign": "error",
    "no-dupe-class-members": "error",
    "no-duplicate-imports": "error",
    "brace-style": ["warn", "stroustrup"],
    camelcase: "warn",

    "comma-spacing": ["warn", {
        before: false,
        after: true,
    }],

    indent: ["warn", 4],

    "key-spacing": ["warn", {
        beforeColon: false,
        afterColon: true,
    }],

    "space-before-blocks": "warn",
    "spaced-comment": "warn",
    "no-shadow": "error",
    "no-shadow-restricted-names": "error",
    "no-undef": "error",

    "no-use-before-define": ["error", {
        functions: false,
        classes: false,
        variables: true,
    }],

    "consistent-return": "error",
    curly: "warn",
    eqeqeq: "error",
    "no-lone-blocks": "error",
    "no-multi-spaces": "warn",
    "no-new": "error",
    "no-proto": "error",
    "no-redeclare": "error",
    "no-self-assign": "error",
    "no-self-compare": "error",
    "require-await": "warn",
    "for-direction": "error",
    "getter-return": "error",
    "no-compare-neg-zero": "error",
    "no-dupe-args": "error",
    "no-dupe-else-if": "error",
    "no-dupe-keys": "error",
    "no-duplicate-case": "error",
    "no-invalid-regexp": "error",
    "no-sparse-arrays": "error",
    "no-template-curly-in-string": "error",
    "no-unreachable": "error",
    "no-unused-vars": "warn",
}

module.exports = defineConfig([
    {
        ignores: ["node_modules*/**"],
    },
    {
        files: ["src/**/*.js"],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: "commonjs",
        },
        rules: rules,
    }
])