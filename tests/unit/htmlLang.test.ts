import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const app  = readFileSync(resolve(ROOT, 'src/app/App.tsx'), 'utf8');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

describe('атрибут lang на <html>', () => {
  it('синхронизируется с языком интерфейса', () => {
    expect(app).toMatch(/setAttribute\('lang',\s*lang === 'FR' \? 'fr' : 'ru'\)/);
  });

  it('эффект зависит именно от языка', () => {
    const idx = app.indexOf("setAttribute('lang'");
    expect(app.slice(idx, idx + 200)).toContain('}, [lang]);');
  });

  it('в разметке остаётся язык по умолчанию', () => {
    expect(html).toMatch(/<html lang="ru">/);
  });

  it('от lang зависит и выбор display-шрифта', () => {
    const scss = readFileSync(resolve(ROOT, 'src/styles/variables.scss'), 'utf8');
    expect(scss).toContain("html[lang='fr']");
  });
});
