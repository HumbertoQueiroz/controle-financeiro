/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const raiz = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Os documentos legais são lidos de Docs/legal para existir uma única versão do
      // texto: uma cópia aqui divergiria um dia da versão que o usuário aceitou, e é o
      // texto aceito que precisa ser demonstrável.
      '@legal': fileURLToPath(new URL('../../Docs/legal', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Sem isto o servidor de desenvolvimento recusa servir arquivos fora de apps/web.
    fs: { allow: [raiz, fileURLToPath(new URL('../..', import.meta.url))] },
  },
  build: {
    // Sem sourcemap em produção: o mapa reconstrói o código original e não há motivo para
    // publicá-lo junto de um app financeiro.
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
