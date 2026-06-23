import { defineConfig } from 'vitest/config';

// Testes do núcleo de domínio (Fase 2): lógica pura, ambiente Node, sem DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    globals: false,
  },
});
