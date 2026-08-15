import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Os testes de integração compartilham um banco só. Rodá-los em paralelo faria
    // uma suíte truncar as tabelas que outra acabou de popular.
    fileParallelism: false,
    // bcrypt com custo 12 é lento de propósito; o padrão de 5s estoura em máquina
    // carregada e produz falha que não é do código.
    testTimeout: 20_000,
  },
});
