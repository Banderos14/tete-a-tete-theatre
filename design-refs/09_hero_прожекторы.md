# Задача: оптимизация прожекторов в Hero-секции

Дизайн-система — в CLAUDE.md. Логику, навигацию, переключатель языков,
кнопки и адаптив НЕ трогать. Меняется только визуальный слой света в Hero.

## Шаг 1. Диагностика (сделай и покажи мне ДО правок)

Найди компонент Hero и реализацию прожекторов. Определи и назови, что именно
тяжёлое. Типичные подозреваемые в порядке вероятности:
- `filter: blur(NNpx)` на больших элементах — главный убийца: размытие
  большой области пересчитывается каждый кадр анимации
- canvas/WebGL/iframe там, где хватит CSS
- анимация свойств, вызывающих layout/paint (width, height, top, left,
  background-position) вместо transform/opacity
- большие PNG/JPG с лучами
- box-shadow с большим spread в анимации

## Шаг 2. Замена на эталонную реализацию

Лучи рисуются ГРАДИЕНТАМИ, которые мягкие сами по себе — blur не нужен вовсе.
Эталон (адаптируй под структуру проекта, SCSS-модуль):

```tsx
// Hero.tsx — слой света, под контентом (z-index ниже текста)
<div className={styles.stageLights} aria-hidden="true">
  <div className={`${styles.beam} ${styles.beamCenter}`} />
  <div className={`${styles.beam} ${styles.beamLeft}`} />
  <div className={`${styles.beam} ${styles.beamRight}`} />
  <div className={`${styles.beam} ${styles.beamRedL}`} />
  <div className={`${styles.beam} ${styles.beamRedR}`} />
  <div className={styles.vignette} />
</div>
```

```scss
.stageLights {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  // один композитный слой на контейнер, не на каждый луч
  contain: strict;
}

.beam {
  position: absolute;
  top: -20%;
  width: 22vw;
  height: 140%;
  // мягкость даёт сам градиент — НИКАКОГО filter: blur
  background: linear-gradient(
    to bottom,
    rgba(243, 231, 220, 0.10) 0%,
    rgba(243, 231, 220, 0.035) 45%,
    transparent 80%
  );
  // сужение кверху — конус прожектора
  clip-path: polygon(42% 0, 58% 0, 100% 100%, 0 100%);
  transform-origin: 50% 0;
  // анимируем ТОЛЬКО transform и opacity
  animation: sway 14s ease-in-out infinite alternate;
  will-change: transform, opacity;
}

.beamCenter { left: 39vw; }
.beamLeft   { left: 12vw; transform: rotate(14deg);  animation-delay: -4s;  animation-duration: 17s; }
.beamRight  { right: 12vw; transform: rotate(-14deg); animation-delay: -9s;  animation-duration: 19s; }

.beamRedL, .beamRedR {
  width: 16vw;
  background: linear-gradient(
    to bottom,
    rgba(192, 57, 43, 0.10) 0%,
    rgba(192, 57, 43, 0.03) 50%,
    transparent 78%
  );
}
.beamRedL { left: 2vw;  transform: rotate(22deg);  animation-delay: -6s;  animation-duration: 21s; }
.beamRedR { right: 2vw; transform: rotate(-22deg); animation-delay: -12s; animation-duration: 16s; }

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 90% 70% at 50% 38%,
    transparent 55%,
    rgba(10, 8, 7, 0.55) 100%
  );
}

@keyframes sway {
  from { transform: rotate(var(--beam-angle, 0deg)) translateX(0);      opacity: 0.85; }
  to   { transform: rotate(var(--beam-angle, 0deg)) translateX(1.5vw); opacity: 1; }
}
```

Замечание по rotate в keyframes: чтобы базовый угол каждого луча не
затирался анимацией, вынеси угол в CSS-переменную --beam-angle на каждом
классе луча (beamLeft: --beam-angle: 14deg и т.д.) и убери transform
из самих классов.

## Шаг 3. Ограничения

- prefers-reduced-motion: reduce → animation: none на .beam (лучи статичны,
  но видимы)
- Мобайл (mixins.mobile): оставить 3 луча (центр + два красных),
  боковые белые скрыть; vignette оставить
- Если текущая реализация — canvas/iframe: удалить полностью вместе
  с подключаемыми скриптами
- Если есть фоновое изображение с лучами — оставить только если оно
  статично и оптимизировано (webp, ≤150KB), иначе удалить: свет теперь CSS

## Шаг 4. Критерии приёмки (проверь сам и покажи как проверял)

1. DevTools → Performance, запись 10s со скроллом, CPU throttling ×4:
   стабильные ~60fps, в таймлайне НЕТ фиолетовых Layout-блоков
   во время анимации лучей
2. DevTools → Rendering → Paint flashing: при анимации лучей
   ничего не мигает зелёным (анимация композитная)
3. Lighthouse Performance мобильный: не хуже, чем до правок
4. npm run build без ошибок

## Шаг 5. Отчёт

Перечисли: изменённые файлы, что удалено, почему новая версия легче
(в терминах: меньше paint-области, нет blur-пересчёта, композитная анимация),
и команды/панели DevTools, которыми я могу перепроверить сам.
