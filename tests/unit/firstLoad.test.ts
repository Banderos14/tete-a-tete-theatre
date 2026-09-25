// Первая загрузка главной: что не должно попадать в критический путь.
// Числа Lighthouse здесь не проверяются — только причины, найденные аудитом.

import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectSource } from '../helpers/serverSource.js';

const ROOT = resolve(__dirname, '../..');

describe('первая загрузка главной', () => {
  it('логотип шапки и подвала — свой маленький файл, а не PNG 824×860 со стороннего CDN', () => {
    for (const file of ['src/pages/HomePage/sections/Header/Header.tsx', 'src/pages/HomePage/sections/Footer/Footer.tsx']) {
      const src = projectSource(file);
      expect(src, file).not.toContain('tildacdn');
      expect(src, file).toContain('src={LOGO_SRC} width={LOGO_WIDTH} height={LOGO_HEIGHT}');
    }
    const logo = join(ROOT, 'public/images/logo-mark.webp');
    expect(existsSync(logo)).toBe(true);
    expect(statSync(logo).size).toBeLessThan(20_000);
  });

  it('постеры видео ниже первого экрана грузятся лениво', () => {
    const video = projectSource('src/pages/HomePage/components/LazyBgVideo/LazyBgVideo.tsx');
    expect(video).toContain('poster={hasBeenInView ? poster : undefined}');
    expect(video).toContain('loading="lazy"');
    expect(video).not.toContain('loading="eager"');
  });

  it('библиотека телефонов не входит в основной бандл', () => {
    for (const eager of ['src/main.tsx', 'src/app/App.tsx', 'src/pages/HomePage/HomePage.tsx', 'src/context/AuthContext.tsx']) {
      expect(projectSource(eager), eager).not.toMatch(/utils\/phone|domain\/phone|libphonenumber/);
    }
  });
});
