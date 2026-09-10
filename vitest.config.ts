import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Юнит-тесты: только чистая логика, без сети и без Firebase.
    // Тесты правил Firestore живут отдельно и требуют эмулятор — см. npm run test:rules.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
