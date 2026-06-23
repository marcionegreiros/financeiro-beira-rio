// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import noFloatMoney from './eslint-rules/no-float-money.js';

const financeiro = {
  rules: {
    'no-float-money/no-float-money': 'error',
  },
  plugins: {
    'no-float-money': {
      rules: { 'no-float-money': noFloatMoney },
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'eslint-rules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // Guarda anti-float aplicada SOMENTE ao código financeiro: domínio puro e a lib de dinheiro.
  {
    files: ['apps/web/src/domain/**/*.ts', 'apps/web/src/lib/money.ts'],
    plugins: financeiro.plugins,
    rules: financeiro.rules,
  },
);
