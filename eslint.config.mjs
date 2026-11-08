import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-core/**', 'node_modules/**', 'coverage/**', 'android/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Network calls are banned in Moonroot.' },
        { name: 'XMLHttpRequest', message: 'Network calls are banned in Moonroot.' },
        { name: 'WebSocket', message: 'Network calls are banned in Moonroot.' },
        { name: 'EventSource', message: 'Network calls are banned in Moonroot.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'sendBeacon',
          message: 'Network calls are banned in Moonroot.',
        },
      ],
    },
  },
  {
    files: ['core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'core/ must never read the system clock; pass today as a parameter.' },
        { name: 'fetch', message: 'core/ must remain pure and offline.' },
        { name: 'XMLHttpRequest', message: 'core/ must remain pure and offline.' },
        { name: 'WebSocket', message: 'core/ must remain pure and offline.' },
        { name: 'EventSource', message: 'core/ must remain pure and offline.' },
        { name: 'window', message: 'core/ must not reference DOM globals.' },
        { name: 'document', message: 'core/ must not reference DOM globals.' },
        { name: 'navigator', message: 'core/ must not reference browser globals.' },
        { name: 'localStorage', message: 'core/ must not reference storage globals.' },
        { name: 'indexedDB', message: 'core/ must not reference storage globals.' },
      ],
      'no-console': 'error',
    },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
