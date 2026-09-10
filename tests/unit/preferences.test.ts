import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(__dirname, '../../src/App.tsx'), 'utf8');

describe('тема сохраняется между сессиями', () => {
  it('начальное значение читается из localStorage', () => {
    expect(app).toMatch(/localStorage\.getItem\('theme'\) === 'light'/);
  });

  it('выбор записывается при переключении', () => {
    expect(app).toMatch(/localStorage\.setItem\('theme', t\)/);
  });

  it('доступ к хранилищу защищён try/catch — приватный режим не ломает старт', () => {
    const themeInit = app.slice(app.indexOf("useState<Theme>("), app.indexOf('const [lang'));
    expect(themeInit).toContain('try {');
    expect(themeInit).toContain('} catch {');
  });
});

describe('язык', () => {
  it('локальный выбор сохраняется', () => {
    expect(app).toMatch(/localStorage\.setItem\('lang', l\)/);
  });

  it('чтение языка тоже защищено try/catch', () => {
    const langInit = app.slice(app.indexOf('useState<Lang>('), app.indexOf('const [introState'));
    expect(langInit).toContain('try {');
  });

  it('язык восстанавливается ИЗ профиля — синхронизация стала двусторонней', () => {
    expect(app).toContain('onLangFromProfile');
    expect(app).toMatch(/profileLang !== lang/);
  });

  it('защита от бесконечной петли синхронизации', () => {
    expect(app).toContain('appliedRef');
    expect(app).toMatch(/if \(!appliedRef\.current\)/);
  });

  it('смена пользователя сбрасывает флаг — новый профиль снова применяется', () => {
    expect(app).toMatch(/if \(!user\) appliedRef\.current = false;/);
  });
});
