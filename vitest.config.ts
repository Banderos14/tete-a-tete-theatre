import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Юнит-тесты не читают .env разработчика: иначе результат зависел бы от того,
  // на какой сайт или Firebase-проект сейчас настроена машина (VITE_PUBLIC_SITE_URL
  // localhost ломал проверку канонического QR). В tests/ файлов .env нет.
  envDir: resolve(__dirname, 'tests'),
  test: {
    // Юнит-тесты: только чистая логика, без сети и без Firebase.
    // Тесты правил Firestore живут отдельно и требуют эмулятор — см. npm run test:rules.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // По умолчанию тесты описывают поведение production. Staging-режим
    // (перенаправление писем, запрет production Firebase и live-ключей Stripe)
    // проверяется явно через vi.stubEnv('VERCEL_ENV', 'preview').
    env: { VERCEL_ENV: 'production' },
  },
});
