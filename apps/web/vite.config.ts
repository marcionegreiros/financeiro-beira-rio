import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// PWA instalável e offline-first (§7.1 / §9 Fase 9 da spec).
// O requisito de negócio é fechar o caixa à beira-rio mesmo sem internet.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icone.svg'],
      manifest: {
        name: 'Pontão Beira Rio',
        short_name: 'Pontão',
        description: 'Controle financeiro do Pontão Beira Rio.',
        lang: 'pt-BR',
        theme_color: '#0F1A24',
        background_color: '#0F1A24',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'icone.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
