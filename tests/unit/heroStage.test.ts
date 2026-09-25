// Световой фон hero «Живая сцена» — структурные гарантии, а не декоративные
// значения: их художественно подстраивают на staging, тест не должен мешать.
// Проверяется: свет — отдельный слой рядом с контентом (резкость текста),
// без полноэкранного blur, адаптив, reduced-motion, светлая тема.

import { describe, it, expect } from 'vitest';
import { projectSource } from '../helpers/serverSource.js';

const tsx  = projectSource('src/pages/HomePage/sections/Hero/Hero.tsx');
const scss = projectSource('src/pages/HomePage/sections/Hero/Hero.module.scss');
const code = scss.replace(/\/\/.*$/gm, '');

/** Тело правила верхнего уровня `selector { … }`. */
function rule(selector: string): string {
  const i = code.indexOf(`\n${selector} {`);
  expect(i, selector).toBeGreaterThan(-1);
  return code.slice(i, code.indexOf('\n}', i));
}

function media(query: string): string {
  const i = code.indexOf(`@media ${query} {`);
  expect(i, query).toBeGreaterThan(-1);
  return code.slice(i, code.indexOf('\n}', i));
}

describe('структура: свет — сосед контента, а не его предок', () => {
  it('сцена стоит перед контентом отдельным блоком и скрыта от скринридеров', () => {
    const stage = tsx.indexOf('<div className={styles.stage} aria-hidden="true">');
    const content = tsx.indexOf('<div className={styles.content}>');
    expect(stage).toBeGreaterThan(-1);
    expect(stage).toBeLessThan(content);
    const between = tsx.slice(stage, content);
    const opens = between.match(/<div\b[^>]*[^/]>/g)!.length;
    expect(opens).toBe(between.match(/<\/div>/g)!.length);
  });

  it('композиция: центральный луч и два красных, база, пол, пятно, виньетка', () => {
    for (const cls of ['base', 'beamKey', 'beamRedL', 'beamRedR', 'floor', 'pool', 'vignette']) {
      expect(tsx, cls).toContain(`styles.${cls}`);
    }
  });

  it('старых систем света нет: ни 17 лучей, ни дымки и зерна сцены', () => {
    expect(tsx).not.toMatch(/beamC[WN]|beamL[123X]|beamR[123X]|beamRed[LR][12]|stageLights|beamFar|styles\.haze|stageGrain/);
    expect(code).not.toMatch(/sweepLeftToCenter|flickerRed|redSweep|crossCenter|hazeBreath|airDrift/);
  });

  it('у hero и контента нет filter / transform / will-change / blend / анимаций', () => {
    for (const sel of ['.hero', '.content', '.headline', '.title']) {
      expect(rule(sel), sel).not.toMatch(/(?<![-\w])(filter|backdrop-filter|transform|will-change|mix-blend-mode|animation):/);
    }
    expect(rule('.stage')).toContain('z-index: 0;');
    expect(rule('.content')).toContain('z-index: 3;');
  });

  it('will-change — только у лучей', () => {
    expect(code.match(/will-change:[^;]+;/g)).toEqual(['will-change: transform, opacity;']);
    expect(rule('.beam')).toContain('will-change');
  });
});

describe('мягкость без полноэкранного размытия', () => {
  const stage = code.slice(code.indexOf('\n.stage {'), code.indexOf('\n.content {'));

  it('в световой сцене нет filter: blur, clip-path и blend-режимов', () => {
    expect(stage).not.toMatch(/filter:\s*blur|clip-path|mix-blend-mode/);
  });

  it('лучи — конические градиенты от точки прибора с маской затухания вниз', () => {
    for (const sel of ['.beamKey', '.beamRedL', '.beamRedR']) {
      expect(stage, sel).toMatch(new RegExp(`\\n\\${sel} \\{[\\s\\S]*?conic-gradient\\(`));
    }
    expect(rule('.beamKey')).toContain('mask-image: linear-gradient(to bottom');
    expect(stage).toMatch(/\.beamRedR \{[\s\S]*?mask-image: linear-gradient\(to bottom/);
  });

  it('лучи не на весь экран: у каждого своя ширина меньше рига', () => {
    expect(rule('.beamKey')).toMatch(/width: \d+%;/);
    expect(stage).toMatch(/\.beamRedL,\s*\.beamRedR \{\s*width: \d+%;/);
  });
});

describe('анимация: только opacity и transform, медленно и мало', () => {
  const keyframes = code.slice(code.indexOf('$stage-ease'), code.indexOf('\n.stage {'));

  it('keyframes сцены меняют только opacity и transform', () => {
    const all = [...keyframes.matchAll(/@keyframes \w+\s*\{([^\n]*)\}/g)];
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(m[1]!.replace(/opacity:[^;]+;|transform:[^;]+;|from|to|[{}\s]/g, '')).toBe('');
    }
  });

  it('качание красных меньше 1°, дыхание центрального — не больше 10%', () => {
    for (const m of keyframes.matchAll(/rotate\((-?[\d.]+)deg\)/g)) expect(Math.abs(Number(m[1]))).toBeLessThan(1);
    const key = /@keyframes keyBreathe\s*\{ from \{ opacity: ([\d.]+); \} to \{ opacity: ([\d.]+); \} \}/.exec(code)!;
    expect(Number(key[2]) - Number(key[1])).toBeLessThanOrEqual(0.1);
  });

  it('центральный луч лишь едва покачивается, пятно на полу следует за ним синхронно', () => {
    const sway = /@keyframes keySway\s*\{ from \{ transform: rotate\((-?[\d.]+)deg\); \} to \{ transform: rotate\((-?[\d.]+)deg\); \} \}/.exec(code)!;
    expect(Math.max(Math.abs(Number(sway[1])), Math.abs(Number(sway[2])))).toBeLessThanOrEqual(0.3);
    const drift = /@keyframes poolDrift\s*\{ from \{ transform: translateX\((-?[\d.]+)px\); \} to \{ transform: translateX\((-?[\d.]+)px\); \} \}/.exec(code)!;
    expect(Math.max(Math.abs(Number(drift[1])), Math.abs(Number(drift[2])))).toBeLessThanOrEqual(8);
    // Одинаковые период, easing и задержка — пятно «привязано» к лучу.
    const timing = (sel: string, name: string) => new RegExp(`${name} ([\\d.]+s \\$stage-ease -?[\\d.]+s)`).exec(rule(sel))![1];
    expect(timing('.pool', 'poolDrift')).toBe(timing('.beamKey', 'keySway'));
    expect(rule('.beamKey')).toContain('transform-origin: 50% -18%;');
  });

  it('линии авансцены нет: у пола нет псевдоэлемента-полосы', () => {
    expect(rule('.floor')).not.toContain('::before');
    expect(rule('.floor')).not.toMatch(/height: 1px/);
  });

  it('центральный луч и пятно дышат с одним периодом', () => {
    const period = (sel: string) => /animation:\s*\w+ ([\d.]+s)/.exec(rule(sel))![1];
    expect(period('.pool')).toBe(period('.beamKey'));
  });
});

describe('линия «Войти в зал»', () => {
  it('анимируется только transform — без смены transform-origin в keyframes', () => {
    // Смена transform-origin не анимируется композитором: линия каждый кадр
    // гоняла пересчёт стилей и растеризацию главного потока.
    const kf = code.slice(code.indexOf('@keyframes scrollLine'), code.indexOf('}\n}', code.indexOf('@keyframes scrollLine')));
    expect(kf).not.toContain('transform-origin');
    expect(kf).toContain('translateY(40px) scaleY(0)');
    expect(rule('.scrollLine')).toContain('height: 40px;');
    expect(rule('.scrollLine')).toContain('transform-origin: top;');
  });
});

describe('адаптив, reduced-motion и светлая тема', () => {
  it('<1024 и <768 — отдельные состояния; на телефоне красные неподвижны', () => {
    expect(media('(max-width: 1023px)')).toMatch(/\.beamRedL \{ animation-name: \w+; \}/);
    const mobile = media('(max-width: 767px)');
    expect(mobile).toMatch(/\.beamRedL,\s*\.beamRedR \{ animation: none; \}/);
    expect(mobile).toMatch(/\.beamKey \{[\s\S]*conic-gradient/);
    // На телефоне — только дыхание, без покачивания луча и смещения пятна.
    expect(mobile).toContain('.beamKey { animation: keyBreathe 9s $stage-ease infinite alternate; }');
    expect(mobile).not.toMatch(/keySway|poolDrift/);
    expect(rule('.hero')).toContain('min-height: 100svh;');
  });

  it('reduced-motion: все анимации сцены выключены, центральный луч статичен', () => {
    const reduced = media('(prefers-reduced-motion: reduce)');
    expect(reduced).toMatch(/\.beam,\s*\.pool,\s*\.stage \{ animation: none !important; \}/);
    expect(reduced).toMatch(/\.beamKey \{ opacity: [\d.]+; \}/);
  });

  it('в светлой теме сцены нет вовсе', () => {
    const light = code.slice(code.indexOf(":global([data-theme='light'])"));
    expect(light).toContain('.stage { display: none; }');
  });
});
