import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.astro/**', 'coverage/**']
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  ...svelte.configs['flat/recommended'],

  {
    files: ['**/*.{js,mjs,ts,astro,svelte}'],
    rules: {
      'no-debugger': 'error',
      'no-alert': 'error'
    }
  }
];
