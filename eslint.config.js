// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // 1. Base recommended configs (no type info needed)
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // 2. Type-checked rules for ALL TypeScript files
  //    Test files have their own tsconfig so they can be parsed too
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow explicit any for quick prototyping
      '@typescript-eslint/no-explicit-any': 'off',

      // Allow unused vars starting with underscore
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Allow non-null assertions for DB query results
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Allow require-style imports for dependencies
      '@typescript-eslint/no-require-imports': 'off',

      // Allow floating promises in event handlers
      '@typescript-eslint/no-floating-promises': 'off',

      // Allow empty functions for callbacks
      '@typescript-eslint/no-empty-function': 'off',

      // Ban ts-ignore only; ts-expect-error is fine
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description' },
      ],

      // Allow implicit returns (void returns)
      '@typescript-eslint/no-confusing-void-expression': 'off',

      // No need to enforce explicit return types
      '@typescript-eslint/explicit-function-return-type': 'off',

      // Allow `throw new Error()` in expressions
      '@typescript-eslint/only-throw-error': 'off',

      // Unsafe access: we use `any` for flexibility
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Prefer `||` over `??` for falsy values (common pattern)
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      // Allow `prefer-regexp-exec` for simple .test() calls
      '@typescript-eslint/prefer-regexp-exec': 'off',

      // Allow `no-unnecessary-condition` for potentially null values
      '@typescript-eslint/no-unnecessary-condition': 'off',

      // Allow `prefer-const` for simplicity
      'prefer-const': 'warn',

      // Allow template expressions with numbers
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],

      // Allow array-type to be generic or simple
      '@typescript-eslint/array-type': 'off',

      // Allow no-deprecated patterns (e.g., .startsWith() string method)
      '@typescript-eslint/no-deprecated': 'off',

      // Allow use-unknown-in-catch-callback-variable
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',

      // Allow require-await (some handlers need to be async for interface)
      '@typescript-eslint/require-await': 'off',

      // Allow no-misused-promises (some Promise-like returns are intended)
      '@typescript-eslint/no-misused-promises': 'off',

      // Allow await-thenable (some async functions accept non-promise)
      '@typescript-eslint/await-thenable': 'off',
    },
  },

  // 3. Test file overrides: even more relaxed
  {
    files: ['src/**/*.test.ts', 'src/**/*.eval.ts', 'src/**/*.bench.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      'no-undef': 'off', // vitest globals (describe, it, expect, vi)
    },
  },

  // 4. Ignores
  {
    ignores: ['dist/', 'node_modules/', '*.config.*', 'coverage/'],
  },
);
