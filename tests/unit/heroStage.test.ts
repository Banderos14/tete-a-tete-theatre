// Световой фон hero «Живая сцена»: значения спецификации, отдельный слой
// света рядом с контентом (резкость текста), адаптив и reduced-motion.

import { describe, it, expect } from 'vitest';
import { projectSource } from '../helpers/serverSource.js';

const tsx  = projectSource('src/pages/HomePage/sections/Hero/Hero.tsx');
const scss = projectSource('src/pages/HomePage/sections/Hero/Hero.module.scss');

/** Тело правила верхнего уровня `selector { … }` (первое вхождение). */
function rule(selector: string, from = 0): string {
  const i = scss.indexOf(`\n${selector} {`, from);
  expect(i, selector).toBeGreaterThan(-1);
  return scss.slice(i, scss.indexOf('\n}', i));
}

function media(query: string): string {
  const i = scss.indexOf(`@media ${query} {`);
  expect(i, query).toBeGreaterThan(-1);
  return scss.slice(i, scss.indexOf('\n}', i));
}

describe('структура: свет — сосед контента, а не его предок', () => {
  it('сцена стоит перед контентом, отдельным блоком, и скрыта от скринридеров', () => {
    const stage = tsx.indexOf('<div className={styles.stage} aria-hidden="true">');
    const content = tsx.indexOf('<div className={styles.content}>');
    expect(stage).toBeGreaterThan(-1);
    expect(stage).toBeLessThan(content);
    // Сцена закрывается до начала контента.
    const between = tsx.slice(stage, content);
    // Открывающие <div …> (не самозакрывающиеся) и </div> уравновешены.
    const opens = between.match(/<div\b[^>]*[^/]>/g)!.length;
    expect(opens).toBe(between.match(/<\/div>/g)!.length);
  });

  it('слои в порядке спецификации: база → дальние → красные → центральный → пол → пятно → ореол → дымка; виньетка и зерно вне рига', () => {
    const order = ['styles.base', 'styles.beamFarL', 'styles.beamFarR', 'styles.beamRedL', 'styles.beamRedR',
      'styles.beamKey', 'styles.floor', 'styles.pool', 'styles.halo', 'styles.haze', 'styles.vignette', 'styles.stageGrain'];
    const positions = order.map(c => tsx.indexOf(c));
    expect(positions.every(p => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('старой системы из ~17 лучей больше нет', () => {
    expect(tsx).not.toMatch(/beamC[WN]|beamL[123X]|beamR[123X]|beamRed[LR][12]|stageLights/);
    expect(scss).not.toMatch(/sweepLeftToCenter|flickerRed|redSweep|crossCenter|hazeBreath|airDrift/);
  });

  it('у hero и контента нет filter / transform / will-change / blend / анимаций', () => {
    for (const sel of ['.hero', '.content', '.headline', '.title']) {
      const body = rule(sel).replace(/\/\/.*$/gm, '');
      expect(body, sel).not.toMatch(/(?<![-\w])(filter|backdrop-filter|transform|will-change|mix-blend-mode|animation):/);
    }
    expect(rule('.hero')).toContain('isolation: isolate;');
    // Контент выше сцены.
    expect(rule('.stage')).toContain('z-index: 0;');
    expect(rule('.content')).toContain('z-index: 3;');
  });

  it('will-change — только у лучей', () => {
    const uses = scss.match(/will-change:[^;]+;/g) ?? [];
    expect(uses).toEqual(['will-change: transform, opacity;']);
    expect(rule('.beam')).toContain('will-change: transform, opacity;');
  });
});

describe('значения спецификации «Живая сцена»', () => {
  it('риг и база', () => {
    expect(rule('.rig')).toContain('width: min(max(100%, 160svh), 220svh);');
    expect(rule('.rig')).toContain('translate: -50% 0;');
    expect(rule('.base')).toContain('radial-gradient(ellipse 70% 55% at 50% 88%, #2b1611 0%, #120a08 45%, #060505 80%)');
  });

  it('геометрия лучей', () => {
    expect(scss).toContain('clip-path: polygon(47% 0, 53% 0, 71% 87%, 29% 87%);');
    expect(scss).toContain('clip-path: polygon(5% 0, 10.5% 0, 54% 90%, 36% 92%);');
    expect(scss).toContain('clip-path: polygon(89.5% 0, 95% 0, 64% 92%, 46% 90%);');
    expect(scss).toContain('clip-path: polygon(23.5% 0, 25.5% 0, 31% 86%, 19% 86%);');
    expect(scss).toContain('clip-path: polygon(74.5% 0, 76.5% 0, 81% 86%, 69% 86%);');
  });

  it('градиенты лучей и группа дальних с opacity .55', () => {
    expect(scss).toContain('linear-gradient(180deg, rgba(255, 240, 220, .42) 0%, rgba(255, 232, 205, .16) 50%, rgba(255, 228, 198, .05) 87%)');
    expect(scss).toContain('linear-gradient(165deg, rgba(210, 36, 24, .55) 0%, rgba(180, 24, 16, .18) 50%, rgba(160, 20, 14, .02) 92%)');
    expect(scss).toContain('linear-gradient(195deg, rgba(210, 36, 24, .55) 0%, rgba(180, 24, 16, .18) 50%, rgba(160, 20, 14, .02) 92%)');
    expect(scss).toContain('linear-gradient(180deg, rgba(255, 238, 214, .22) 0%, rgba(255, 238, 214, .02) 90%)');
    expect(rule('.beamFarL,\n.beamFarR')).toContain('opacity: .55;');
  });

  it('blur — на внешнем элементе луча, clip-path — на внутреннем <i>', () => {
    expect(scss).toContain('filter: blur(clamp(6px, .62vw, 12px));');
    expect(scss).toContain('filter: blur(clamp(8px, .83vw, 16px));');
    const beamRule = rule('.beam');
    expect(beamRule).not.toContain('clip-path');
    // Ни у одного правила blur и clip-path не стоят вместе на одном уровне.
    for (const sel of ['.beamKey', '.beamRedL', '.beamRedR']) {
      const outer = rule(sel, scss.indexOf('\n.beamRedL {')).split('> i')[0]!;
      expect(outer, sel).not.toContain('clip-path');
    }
  });

  it('пол, линия авансцены, пятно, ореол, дымка, виньетка, зерно', () => {
    expect(rule('.floor')).toContain('top: 85.5%;');
    expect(rule('.floor')).toContain('linear-gradient(180deg, rgba(38, 20, 15, .55), #050404)');
    expect(rule('.floor')).toContain('linear-gradient(90deg, transparent 10%, rgba(243, 236, 226, .28) 50%, transparent 90%)');
    const pool = rule('.pool');
    for (const v of ['top: 78%;', 'width: 54%;', 'height: 16.7%;', 'filter: blur(6px);',
      'radial-gradient(ellipse at center, rgba(255, 236, 210, .32) 0%, rgba(255, 215, 185, .08) 50%, transparent 72%)']) {
      expect(pool).toContain(v);
    }
    const halo = rule('.halo');
    for (const v of ['top: 81%;', 'width: 69%;', 'height: 13%;', 'filter: blur(10px);', 'radial-gradient(rgba(200, 40, 28, .16), transparent 70%)']) {
      expect(halo).toContain(v);
    }
    expect(rule('.haze')).toContain('radial-gradient(ellipse 38% 26% at 50% 42%, rgba(255, 240, 225, .07), transparent 70%)');
    expect(rule('.haze')).toContain('radial-gradient(ellipse 30% 40% at 28% 62%, rgba(190, 40, 28, .07), transparent 70%)');
    expect(rule('.haze')).toContain('radial-gradient(ellipse 30% 40% at 72% 62%, rgba(190, 40, 28, .07), transparent 70%)');
    expect(rule('.vignette')).toContain('radial-gradient(ellipse 78% 72% at 50% 48%, transparent 52%, rgba(0, 0, 0, .72) 100%)');
    const grain = rule('.stageGrain');
    expect(grain).toContain("baseFrequency='.85' numOctaves='3'");
    expect(grain).toContain('opacity: .09;');
    expect(grain).toContain('mix-blend-mode: overlay;');
    expect(grain).toContain('background-size: 220px;');
  });
});

describe('анимация: медленная, < 2°, только opacity и transform', () => {
  it('keyframes и тайминги', () => {
    expect(scss).toContain('@keyframes keyBreathe  { from { opacity: .86; } to { opacity: 1; } }');
    expect(scss).toContain('@keyframes poolBreathe { from { opacity: .80; } to { opacity: 1; } }');
    expect(scss).toContain('@keyframes swayL       { from { transform: rotate(-1.4deg); } to { transform: rotate(1.2deg); } }');
    expect(scss).toContain('@keyframes swayR       { from { transform: rotate(1.3deg); }  to { transform: rotate(-1.1deg); } }');
    expect(scss).toContain('$stage-ease: cubic-bezier(.37, 0, .63, 1);');
    expect(rule('.beamKey')).toContain('animation: keyBreathe 9s $stage-ease infinite alternate;');
    expect(rule('.pool')).toContain('animation: poolBreathe 9s $stage-ease infinite alternate;');
    expect(rule('.beamRedL')).toContain('animation: swayL 13s $stage-ease -4s infinite alternate;');
    const redR = rule('.beamRedR', scss.indexOf('\n.beamRedL {'));
    expect(redR).toContain('animation: swayR 17s $stage-ease -9s infinite alternate;');
    expect(rule('.beamRedL')).toContain('transform-origin: 7.75% 0;');
    expect(redR).toContain('transform-origin: 92.25% 0;');
  });

  it('никаких поворотов больше 2° в keyframes сцены', () => {
    const stageCss = scss.slice(scss.indexOf('$stage-ease'), scss.indexOf('\n.stage {'));
    for (const m of stageCss.matchAll(/rotate\((-?[\d.]+)deg\)/g)) expect(Math.abs(Number(m[1]))).toBeLessThan(2);
  });
});

describe('адаптив, reduced-motion и светлая тема', () => {
  it('<1024: без дальних лучей, качание ±1°', () => {
    const tablet = media('(max-width: 1023px)');
    expect(tablet).toMatch(/\.beamFarL,\s*\.beamFarR \{ display: none; \}/);
    expect(tablet).toContain('animation-name: swayLTablet;');
    expect(scss).toContain('@keyframes swayLTablet { from { transform: rotate(-1deg); } to { transform: rotate(1deg); } }');
  });

  it('<768: узкий центральный луч, blur 6/8, пятно 73%, без качания, зерно .06', () => {
    const mobile = media('(max-width: 767px)');
    expect(mobile).toContain('clip-path: polygon(48% 0, 52% 0, 64% 87%, 36% 87%);');
    expect(mobile).toContain('filter: blur(6px);');
    expect(mobile).toContain('filter: blur(8px);');
    expect(mobile).toMatch(/\.beamRedR \{\s*filter: blur\(8px\);\s*animation: none;/);
    expect(mobile).toContain('.pool { top: 73%; }');
    expect(mobile).toContain('.stageGrain { opacity: .06; }');
    expect(rule('.hero')).toContain('min-height: 100svh;');
  });

  it('reduced-motion: всё статично, центральный луч .93', () => {
    const reduced = media('(prefers-reduced-motion: reduce)');
    expect(reduced).toMatch(/\.beam,\s*\.pool,\s*\.haze,\s*\.stage \{ animation: none !important; \}/);
    expect(reduced).toContain('.beamKey { opacity: .93; }');
  });

  it('в светлой теме сцена скрыта', () => {
    const light = scss.slice(scss.indexOf(":global([data-theme='light'])"));
    expect(light).toContain('.stage { display: none; }');
  });
});
