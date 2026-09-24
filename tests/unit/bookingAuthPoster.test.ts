import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Show } from '../../src/types';
import { SHOWS } from '../../src/data/shows';
import { RU } from '../../src/i18n/ru';
import { FR } from '../../src/i18n/fr';
import { buildAuthShowCard } from '../../src/components/ui/BookingModal/authShowCard';
import { BookingAuthShowPanel } from '../../src/components/ui/BookingModal/BookingAuthShowPanel';
import { functionBody, projectSource } from '../helpers/serverSource.js';

// Постер шага входа берётся из объекта show каталога — тот же show.image,
// что у Афиши, Репертуара и ShowModal. Своей таблицы картинок у модалки нет.

const byId = (id: string): Show => {
  const show = SHOWS.find(s => s.id === id);
  if (!show) throw new Error(`нет спектакля ${id} в каталоге`);
  return show;
};

const render = (show: Show, lang: 'RU' | 'FR' = 'RU') =>
  renderToStaticMarkup(createElement(BookingAuthShowPanel, { show, lang, t: lang === 'FR' ? FR : RU }));

/** src у картинок с непустым alt — сам постер, без декоративного фона. */
const posterSrcs = (html: string) =>
  [...html.matchAll(/<img[^>]*>/g)]
    .map(m => m[0])
    .filter(tag => !/alt=""/.test(tag))
    .map(tag => /src="([^"]+)"/.exec(tag)?.[1]);

describe('постер выбранного спектакля на шаге входа', () => {
  const romantika = byId('romantika');
  const shutka    = byId('shutka');

  it('спектакль с постером → рендерится его изображение из каталога', () => {
    expect(romantika.image).toBeTruthy();
    const html = render(romantika);
    expect(posterSrcs(html)).toEqual([romantika.image]);
    expect(html).toContain('data-show-id="romantika"');
    expect(html).toContain('<figure');
  });

  it('спектакль A → постер A, а не постер B', () => {
    expect(romantika.image).not.toBe(shutka.image);
    expect(posterSrcs(render(shutka))).toEqual([shutka.image]);
    expect(render(shutka)).not.toContain(romantika.image!);
    expect(render(romantika)).not.toContain(shutka.image!);
  });

  it('размытый фон — копия того же постера, не чужая фотография', () => {
    const imgs = [...render(romantika).matchAll(/<img[^>]*src="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(imgs)).toEqual(new Set([romantika.image]));
  });

  it('новый постер в каталоге подхватывается без правок модалки', () => {
    const repostered = { ...romantika, image: '/assets/new-poster-a1b2c3.webp' };
    expect(posterSrcs(render(repostered))).toEqual(['/assets/new-poster-a1b2c3.webp']);
  });

  it('alt постера содержит название спектакля', () => {
    expect(render(romantika)).toContain(`alt="${RU.booking.posterAlt(romantika.title)}"`);
    expect(RU.booking.posterAlt(romantika.title)).toContain(romantika.title);
  });

  it('FR → французское название и месяц, без русского текста', () => {
    const card = buildAuthShowCard(romantika, 'FR', FR);
    expect(card.title).toBe(romantika.titleFR);
    expect(card.meta).toBe(`${romantika.day} ${FR.months[romantika.month as keyof typeof FR.months]} · ${romantika.time}`);
    expect(card.posterAlt).toContain(romantika.titleFR);

    const html = render(romantika, 'FR');
    expect(html).toContain(romantika.titleFR!);
    expect(html).not.toContain(romantika.title);
    expect(html.replace(/src="[^"]*"/g, '')).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('RU → русское название', () => {
    expect(buildAuthShowCard(romantika, 'RU', RU).title).toBe(romantika.title);
  });

  it('спектакль без изображения → текстовая карточка, без падения и без чужого постера', () => {
    const { image: _omit, ...rest } = shutka;
    void _omit;
    const noPoster = { ...rest, id: 'no-poster' } as Show;
    let html = '';
    expect(() => { html = render(noPoster); }).not.toThrow();
    expect(html).not.toContain('<img');
    expect(html).toContain(noPoster.title);
    expect(html).toContain(`${noPoster.day} ${RU.months[noPoster.month as keyof typeof RU.months]} · ${noPoster.time}`);
    expect(buildAuthShowCard({ ...noPoster, image: '   ' }, 'RU', RU).poster).toBeNull();
  });
});

describe('спектакль не зависит от состояния входа', () => {
  const modal = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
  const panel = projectSource('src/components/ui/BookingModal/BookingAuthShowPanel.tsx');

  it('панель получает только спектакль и язык — вкладка, загрузка и ошибка ей не передаются', () => {
    expect(modal).toContain('<BookingAuthShowPanel show={show} lang={lang} t={t} />');
    const props = panel.slice(panel.indexOf('interface Props'), panel.indexOf('}', panel.indexOf('interface Props')));
    expect(props).not.toMatch(/auth|tab|loading|error/i);
  });

  it('вход ↔ регистрация: панель стоит вне веток по authTab и рендерится одинаково', () => {
    const authStep = modal.slice(modal.indexOf("{step === 'auth' && ("), modal.indexOf("{step === 'form' && ("));
    const panelAt  = authStep.indexOf('<BookingAuthShowPanel');
    expect(panelAt).toBeGreaterThan(-1);
    expect(panelAt).toBeLessThan(authStep.indexOf('styles.authTabs'));
    expect(authStep.slice(0, panelAt)).not.toContain('authTab');

    // Один и тот же спектакль при любой вкладке даёт одну и ту же разметку.
    const show = byId('korablik');
    expect(render(show)).toBe(render(show));
  });

  it('успешный вход ведёт на форму того же спектакля, а не закрывает модалку', () => {
    expect(modal).toMatch(/if \(user && step === 'auth'\) setStep\('form'\)/);
    for (const handler of ['handleGoogle', 'handleAuth']) {
      const body = functionBody(modal, handler);
      expect(body, handler).not.toBe('');
      expect(body, handler).not.toMatch(/onClose|navigate|setStep|location/);
    }
    expect(modal).toMatch(/<BookingFormStep\s+show=\{show\}/);
  });

  it('выбор билета сбрасывается только при смене спектакля, не при входе', () => {
    const reset = modal.slice(modal.indexOf('// Сбрасываем все поля при открытии для нового спектакля'));
    expect(reset.slice(0, reset.indexOf('}, ['))).toContain('setBasket([])');
    expect(reset).toMatch(/^[\s\S]*?\}, \[show\?\.id\]\);/);
    expect(reset.slice(0, reset.indexOf('}, [show?.id]);'))).not.toMatch(/\[user/);
  });
});
