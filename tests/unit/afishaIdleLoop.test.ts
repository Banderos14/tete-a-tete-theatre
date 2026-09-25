// Автопрокрутка афиши не держит постоянный цикл requestAnimationFrame.
// Регрессия: цикл крутился всегда — и когда афиша вне экрана, и когда карточки
// под курсором, — ~120 раз в секунду писал transform и пересчитывал стили
// всей страницы, даже если пользователь ничего не делал.

import { describe, it, expect } from 'vitest';
import { projectSource } from '../helpers/serverSource.js';

const src = projectSource('src/pages/HomePage/sections/Afisha/AfishaSlider.tsx');
const loop = src.slice(src.indexOf('const shouldRun = () =>'), src.indexOf('return () => {', src.indexOf('const shouldRun = () =>')));

describe('автопрокрутка афиши — только когда она нужна', () => {
  it('кадр планируется, только если слайдер виден, вкладка активна и карточки не держат', () => {
    expect(loop).toContain('inViewRef.current && !document.hidden && !isHoveredRef.current && !drag.current.isDragging');
    expect(loop).toContain('if (!shouldRun()) { rafRef.current = 0; return; }');
  });

  it('не больше одного запланированного кадра', () => {
    expect(loop).toContain('if (rafRef.current === 0 && shouldRun()) rafRef.current = requestAnimationFrame(tick);');
  });

  it('видимость — через IntersectionObserver, вкладка — через visibilitychange', () => {
    expect(loop).toContain('new IntersectionObserver(');
    expect(loop).toContain("document.addEventListener('visibilitychange', start);");
  });

  it('цикл снова запускается, когда курсор уходит и перетаскивание заканчивается', () => {
    expect(src).toContain('isHoveredRef.current = false; startLoopRef.current();');
    expect(src.match(/startLoopRef\.current\(\);/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('бесконечного requestAnimationFrame без условия больше нет', () => {
    expect(src).not.toMatch(/rafRef\.current = requestAnimationFrame\(tick\);\s*\};\s*rafRef\.current = requestAnimationFrame\(tick\);/);
  });
});
