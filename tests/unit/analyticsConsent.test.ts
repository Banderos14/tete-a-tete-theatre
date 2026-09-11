import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT      = resolve(__dirname, '../..');
const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const analytics = readFileSync(resolve(ROOT, 'src/services/analytics.ts'), 'utf8');
const app       = readFileSync(resolve(ROOT, 'src/app/App.tsx'), 'utf8');
const mainTsx   = readFileSync(resolve(ROOT, 'src/main.tsx'), 'utf8');

describe('GA4 не стартует без согласия', () => {
  it('gtag.js больше не подключается прямо в index.html', () => {
    expect(indexHtml).not.toContain('googletagmanager.com/gtag/js');
  });

  it('в index.html не осталось вызовов gtag(', () => {
    expect(indexHtml).not.toMatch(/gtag\(\s*'config'/);
    expect(indexHtml).not.toMatch(/gtag\(\s*'js'/);
  });

  it('идентификатор измерения вынесен в мета-тег', () => {
    expect(indexHtml).toContain('name="ga-measurement-id"');
  });

  it('скрипт подключается только из loadAnalytics', () => {
    expect(analytics).toContain('googletagmanager.com/gtag/js');
    expect(analytics).toContain('export function loadAnalytics');
  });

  it('загрузка идемпотентна', () => {
    expect(analytics).toMatch(/if \(loaded\) return;/);
  });

  it('согласие сохраняется и переживает перезагрузку', () => {
    expect(analytics).toContain("const STORAGE_KEY = 'cookie-consent'");
    expect(analytics).toContain('export function applyStoredConsent');
    expect(analytics).toMatch(/readStoredConsent\(\) === 'granted'/);
  });

  it('чтение и запись хранилища защищены try/catch (приватный режим)', () => {
    expect(analytics).toMatch(/try \{[\s\S]*localStorage\.getItem[\s\S]*\} catch/);
    expect(analytics).toMatch(/try \{ localStorage\.setItem[\s\S]*\} catch/);
  });
});

describe('баннер согласия', () => {
  it('подключён в приложении', () => {
    expect(app).toContain('<CookieConsent />');
  });

  it('есть обе кнопки — отказ должен быть настоящим выбором', () => {
    const banner = readFileSync(resolve(ROOT, 'src/components/ui/CookieConsent/CookieConsent.tsx'), 'utf8');
    expect(banner).toContain("decide('denied')");
    expect(banner).toContain("decide('granted')");
    expect(banner).toMatch(/if \(value === 'granted'\) loadAnalytics\(\)/);
  });

  it('баннер двуязычный', () => {
    const banner = readFileSync(resolve(ROOT, 'src/components/ui/CookieConsent/CookieConsent.tsx'), 'utf8');
    expect(banner).toContain('Refuser');
    expect(banner).toContain('Отказаться');
  });
});

describe('Vercel Analytics не затронут — он работает без cookie', () => {
  it('Analytics и SpeedInsights остались в main.tsx', () => {
    expect(mainTsx).toContain('<Analytics />');
    expect(mainTsx).toContain('<SpeedInsights />');
  });
});
