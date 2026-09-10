import { defineConfig } from 'vitest/config';

// Тесты правил Firestore. Требуют запущенного эмулятора, поэтому вынесены
// в отдельный конфиг и не входят в обычный `npm test`.
// Запуск: npm run test:rules (нужен Firebase Emulator и установленная Java).
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Правила — общее состояние эмулятора, параллелить нельзя.
    fileParallelism: false,
  },
});
