import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Os testes de integração compartilham um banco só. Rodá-los em paralelo faria
    // uma suíte truncar as tabelas que outra acabou de popular.
    fileParallelism: false,
  },
});
