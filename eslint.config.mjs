import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': 'warn',
    },
  },
  { files: ['client/**/*.jsx'], ...reactHooks.configs.flat.recommended },
  {
    files: ['server/**/*.js', 'shared/**/*.js', 'test/**/*.js', 'scripts/**/*.js', '*.mjs', 'client/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  },
  {
    files: ['**/*.test.{js,jsx}', 'client/test/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
