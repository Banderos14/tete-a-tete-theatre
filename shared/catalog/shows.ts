// Серверный каталог спектаклей — единственный источник правды по ценам и датам.
//
// ВАЖНО: при изменении расписания правь ЭТОТ файл и src/data/shows.ts.
// Совпадение id, дат, времени и цен проверяется тестом
// tests/unit/pastShows.test.ts — он упадёт, если файлы разъедутся.

import { parseShowStartUtcMs } from '../domain/showTime.js';

// constellation / regular — тарифы «Дюймовочки» (дети «Созвездия» и обычный
// билет для взрослых и детей). Названия у id общие на весь проект
// (shared/catalog/ticketTypes.ts): по ним письмо, PDF, Stripe, кабинет и
// админка подписывают состав брони, поэтому у нового смысла — новый id, а не
// переименованный старый.
//
// funtik_* / sladosti_* — пакеты новогодних постановок (см. FUNTIK_TICKETS и
// SLADOSTI_TICKETS ниже). Префикс постановки в id обязателен: у одинаковых по
// составу пакетов разные цены и разные категории, а подпись брони в письме,
// PDF и админке находится по id тарифа.
export type TicketTypeId = 'standard' | 'student' | 'child' | 'adult' | 'family' | 'constellation' | 'regular'
  | FuntikTicketTypeId | SladostiTicketTypeId;

type PackageShape = 'child' | 'adult' | '1a1c' | '2a1c' | '1a2c' | '2a2c';
export type FuntikTicketTypeId = `funtik_${'assoc' | 'std'}_${PackageShape}`;
export type SladostiTicketTypeId = `sladosti_${'1a1c' | '2a1c' | '1a2c' | '2a2c'}`;

/** Категория тарифа в форме брони (заголовок группы пакетов). */
export type TariffGroupId = 'association' | 'standard';

export interface TicketInfo {
  label:   string;
  labelFR: string;
  price:   number;
  /** Сколько мест в зале занимает одна единица тарифа. Семейный билет занимает три. */
  seats:   number;
  /** Короткое пояснение к тарифу в форме брони (необязательно). */
  hint?:   string;
  hintFR?: string;
  /**
   * Пакет: сколько в нём взрослых, детей и подарков. У пакета цена — за весь
   * пакет, а seats = adults + children (подарок места не занимает). У обычных
   * тарифов полей нет.
   */
  adults?:   number;
  children?: number;
  gifts?:    number;
  /** Категория пакета (семьи ассоциации / стандартные тарифы). */
  group?:    TariffGroupId;
}

export interface ShowInfo {
  title:   string;
  titleFR: string;
  day:     string;
  month:   string;
  time:    string;
  year:    string;
  // ЕДИНСТВЕННЫЙ признак публикации на весь проект: сервер (бронирование,
  // остаток мест, проверка билетов) и сайт (Афиша, Репертуар, форма брони,
  // админка, сканер — через src/data/shows.ts) читают именно его.
  //
  // false — заготовка сезона: дата (а иногда и цены) уже известна, но
  // материалов для афиши ещё нет. Такой спектакль намеренно не попадает в
  // SHOWS: его нельзя забронировать, его нет в остатке мест и на сайте.
  published: boolean;
  /**
   * Постановка, к которой относится сеанс. У постановки с несколькими
   * показами («Фунтик», «Страна сладостей») каждый показ — ОТДЕЛЬНАЯ запись
   * каталога со своим id (это и есть performanceId): своя вместимость, свой
   * остаток мест, свой QR-контекст и своя сессия Stripe. productionId лишь
   * собирает их в одну карточку Афиши и Репертуара. Нет поля — постановка
   * совпадает с id (один показ, как у всех прежних спектаклей).
   */
  productionId?: string;
  /**
   * Действует ли на брони этого сеанса скидка программы лояльности. Нет поля —
   * действует. false — у пакетных постановок: скидка 50 % «на один билет» для
   * пакета означала бы половину цены всего пакета вместе с подарками. Решение
   * театра (ноябрь 2026): на такие брони скидка не применяется, заработанный
   * бонус не тратится и остаётся на другой спектакль.
   */
  loyaltyEligible?: boolean;
  tickets: Partial<Record<TicketTypeId, TicketInfo>>;
}

// Вместимость зала — единый источник правды. Каталог лежит в shared/, поэтому
// и сервер, и фронтенд берут значение отсюда напрямую; авторитетная проверка
// вместимости происходит на сервере в транзакции создания брони.
export const THEATRE_CAPACITY = 50;

// Максимум билетов в одной брони.
export const MAX_TICKETS_PER_BOOKING = 10;

// ── Пакеты новогодних постановок ─────────────────────────────────────────────
//
// Цены — официальные цены театра ЗА ВЕСЬ ПАКЕТ (не за человека) и формулой не
// выводятся: «2 взрослых + 2 ребёнка» у ассоциации стоит 130 €, а не
// 2 × 35 + 2 × 50. Места = взрослые + дети; подарок места не занимает.

const pkg = (
  label: string, labelFR: string, price: number,
  adults: number, children: number, gifts: number, group?: TariffGroupId,
): TicketInfo => ({
  label, labelFR, price, adults, children, gifts, seats: adults + children, ...(group ? { group } : {}),
});

// «Фунтик: Новогодний переполох» — две категории по шесть пакетов.
export const FUNTIK_TICKETS: Record<FuntikTicketTypeId, TicketInfo> = {
  funtik_assoc_child: pkg('Ребёнок с подарком',                 'Enfant avec cadeau',               50, 0, 1, 1, 'association'),
  funtik_assoc_adult: pkg('Взрослый без подарка',               'Adulte sans cadeau',               35, 1, 0, 0, 'association'),
  funtik_assoc_1a1c:  pkg('Взрослый + ребёнок, 1 подарок',      'Adulte + enfant, 1 cadeau',        80, 1, 1, 1, 'association'),
  funtik_assoc_2a1c:  pkg('2 взрослых + ребёнок, 1 подарок',    '2 adultes + enfant, 1 cadeau',    100, 2, 1, 1, 'association'),
  funtik_assoc_1a2c:  pkg('Взрослый + 2 ребёнка, 2 подарка',    'Adulte + 2 enfants, 2 cadeaux',   120, 1, 2, 2, 'association'),
  funtik_assoc_2a2c:  pkg('2 взрослых + 2 ребёнка, 2 подарка',  '2 adultes + 2 enfants, 2 cadeaux', 130, 2, 2, 2, 'association'),
  funtik_std_child:   pkg('Ребёнок с подарком',                 'Enfant avec cadeau',               60, 0, 1, 1, 'standard'),
  funtik_std_adult:   pkg('Взрослый без подарка',               'Adulte sans cadeau',               45, 1, 0, 0, 'standard'),
  funtik_std_1a1c:    pkg('Взрослый + ребёнок, 1 подарок',      'Adulte + enfant, 1 cadeau',       100, 1, 1, 1, 'standard'),
  funtik_std_2a1c:    pkg('2 взрослых + ребёнок, 1 подарок',    '2 adultes + enfant, 1 cadeau',    130, 2, 1, 1, 'standard'),
  funtik_std_1a2c:    pkg('Взрослый + 2 ребёнка, 2 подарка',    'Adulte + 2 enfants, 2 cadeaux',   150, 1, 2, 2, 'standard'),
  funtik_std_2a2c:    pkg('2 взрослых + 2 ребёнка, 2 подарка',  '2 adultes + 2 enfants, 2 cadeaux', 170, 2, 2, 2, 'standard'),
};

// «Новый год в стране сладостей» — ровно четыре семейных пакета, без категорий.
export const SLADOSTI_TICKETS: Record<SladostiTicketTypeId, TicketInfo> = {
  sladosti_1a1c: pkg('Взрослый + ребёнок, 1 подарок',     'Adulte + enfant, 1 cadeau',        50, 1, 1, 1),
  sladosti_2a1c: pkg('2 взрослых + ребёнок, 1 подарок',   '2 adultes + enfant, 1 cadeau',     70, 2, 1, 1),
  sladosti_1a2c: pkg('Взрослый + 2 ребёнка, 2 подарка',   'Adulte + 2 enfants, 2 cadeaux',    85, 1, 2, 2),
  sladosti_2a2c: pkg('2 взрослых + 2 ребёнка, 2 подарка', '2 adultes + 2 enfants, 2 cadeaux', 90, 2, 2, 2),
};

// «Fountik : Panique au Nouvel An» — рабочий перевод, официальное французское
// название театр не утверждал.
const FUNTIK_TITLE   = '«Фунтик: Новогодний переполох»';
const FUNTIK_TITLEFR = '«Fountik : Panique au Nouvel An»';
const SLADOSTI_TITLE   = '«Новый год в стране сладостей»';
const SLADOSTI_TITLEFR = '«Le Nouvel An au pays des douceurs»';

/** Сеанс постановки с несколькими показами: всё общее, кроме даты и времени. */
const session = (
  productionId: string, title: string, titleFR: string, tickets: ShowInfo['tickets'],
) => (day: string, month: string, year: string, time: string): ShowInfo => ({
  title, titleFR, day, month, time, year,
  published: true, productionId, loyaltyEligible: false, tickets,
});
const funtik   = session('funtik', FUNTIK_TITLE, FUNTIK_TITLEFR, FUNTIK_TICKETS);
const sladosti = session('sladosti', SLADOSTI_TITLE, SLADOSTI_TITLEFR, SLADOSTI_TICKETS);

// Весь сезон целиком. Опубликованы все показы, кроме заготовки «Летучего корабля»; будущие даты
// можно сначала завести здесь с published: false, пока нет материалов и цен.
export const SEASON_CATALOG: Record<string, ShowInfo> = {
  // ── Сентябрь 2026 ──
  romantika: {
    title: '«Романтика обреченности»', titleFR: '«La Romanesque de la Fatalité»',
    day: '17', month: 'Сен', time: '20:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 20, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 15, seats: 1 },
    },
  },

  // ── Октябрь 2026 ──
  shutka: {
    title: '«И в шутку, и всерьёз»', titleFR: '«Sérieusement ou pas»',
    day: '02', month: 'Окт', time: '20:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 30, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, seats: 1 },
    },
  },
  korablik: {
    title: '«Приключения кораблика»', titleFR: '«Les Aventures du petit bateau»',
    day: '04', month: 'Окт', time: '10:00', year: '2026',
    published: true,
    tickets: {
      child:  { label: 'Ребёнок', labelFR: 'Enfant', price: 20, seats: 1 },
      adult:  { label: 'Взрослый', labelFR: 'Adulte', price: 15, seats: 1 },
      family: { label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, seats: 3 },
    },
  },
  razgovor: {
    title: '«Разговор, которого не было»', titleFR: '«La conversation qui n\'a pas eu lieu»',
    day: '16', month: 'Окт', time: '20:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 25, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, seats: 1 },
    },
  },
  enot: {
    title: '«Крошка Енот»', titleFR: '«Le Petit Raton laveur»',
    day: '18', month: 'Окт', time: '10:00', year: '2026',
    published: true,
    tickets: {
      child:  { label: 'Ребёнок', labelFR: 'Enfant', price: 20, seats: 1 },
      adult:  { label: 'Взрослый', labelFR: 'Adulte', price: 15, seats: 1 },
      family: { label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, seats: 3 },
    },
  },

  // ── Ноябрь 2026 ──
  lubov: {
    title: '«Счастливая любовь»', titleFR: '«Un amour heureux»',
    day: '14', month: 'Ноя', time: '19:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 20, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 15, seats: 1 },
    },
  },
  shapochka: {
    title: '«Красная Шапочка»', titleFR: '«Le Petit Chaperon rouge»',
    day: '15', month: 'Ноя', time: '10:00', year: '2026',
    published: true,
    tickets: {
      child:  { label: 'Ребёнок', labelFR: 'Enfant', price: 20, seats: 1 },
      adult:  { label: 'Взрослый', labelFR: 'Adulte', price: 15, seats: 1 },
      family: { label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, seats: 3 },
    },
  },
  letuchiy: {
    title: '«Летучий корабль»', titleFR: '«Le Vaisseau volant»',
    day: '21', month: 'Ноя', time: '19:00', year: '2026',
    // Заготовка: официального постера ещё нет, на сайте спектакля нет — и
    // продавать его нельзя. Раньше здесь стояло published: true, а скрыт он
    // был только во фронтовом списке: сервер принимал брони, админка и сканер
    // показывали его как активный. Опубликовать — поставить true, когда в
    // src/data/shows.ts появится постер (см. комментарий там).
    published: false,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 30, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, seats: 1 },
    },
  },
  duimovochka: {
    // Спектакль детской театральной студии культурно-образовательного центра
    // «Созвездие». Французское название «Poucette» — из задания театра.
    // Афиша и описание — src/data/shows.ts; возрастного ограничения театр
    // не указал, длительность пока не известна.
    title: '«Дюймовочка»', titleFR: '«Poucette»',
    day: '22', month: 'Ноя', time: '11:00', year: '2026',
    published: true,
    // Ровно два тарифа. «Созвездие» зритель выбирает сам — проверки
    // принадлежности к организации нет.
    tickets: {
      constellation: { label: 'Дети «Созвездия»', labelFR: 'Enfants de Constellation', price: 10, seats: 1 },
      regular:       {
        label: 'Обычный билет', labelFR: 'Billet standard', price: 15, seats: 1,
        hint: 'Для взрослых и детей', hintFR: 'Pour adultes et enfants',
      },
    },
  },
  kovcheg: {
    title: '«У ковчега в восемь»', titleFR: '«À l\'arche à huit heures»',
    day: '28', month: 'Ноя', time: '19:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 30, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, seats: 1 },
    },
  },

  // ── Декабрь 2026 — январь 2027: новогодние постановки ──
  // id сеанса = performanceId: «<постановка>-<ГГГГ-ММ-ДД>-<ЧЧММ>». id нельзя
  // менять после начала продаж — по нему лежат брони, остаток мест и QR-проход.
  'funtik-2026-12-12-1800':   funtik('12', 'Дек', '2026', '18:00'),
  'sladosti-2026-12-13-1100': sladosti('13', 'Дек', '2026', '11:00'),
  'funtik-2026-12-13-1500':   funtik('13', 'Дек', '2026', '15:00'),
  'funtik-2026-12-13-1800':   funtik('13', 'Дек', '2026', '18:00'),
  'funtik-2026-12-19-1800':   funtik('19', 'Дек', '2026', '18:00'),
  'sladosti-2026-12-20-1100': sladosti('20', 'Дек', '2026', '11:00'),
  'funtik-2026-12-20-1500':   funtik('20', 'Дек', '2026', '15:00'),
  'funtik-2026-12-20-1800':   funtik('20', 'Дек', '2026', '18:00'),
  // Январь — уже 2027 год.
  'sladosti-2027-01-10-1100': sladosti('10', 'Янв', '2027', '11:00'),
};

// Афиша и бронирование видят ТОЛЬКО опубликованные спектакли: валидация
// создания брони, остаток мест и проверка актуальности билета ходят сюда.
// Неопубликованная заготовка для них просто не существует — /api/create-booking
// ответит «Invalid showId», а не продаст билет на спектакль без цены.
export const SHOWS: Record<string, ShowInfo> = Object.fromEntries(
  Object.entries(SEASON_CATALOG).filter(([, show]) => show.published),
);

// Заготовки сезона: дата известна, материалов ещё нет.
export const DRAFT_SHOWS: Record<string, ShowInfo> = Object.fromEntries(
  Object.entries(SEASON_CATALOG).filter(([, show]) => !show.published),
);

/** Постановка сеанса: productionId или сам id (спектакль с одним показом). */
export function productionIdOf(showId: string, show: Pick<ShowInfo, 'productionId'> | undefined = SEASON_CATALOG[showId]): string {
  return show?.productionId ?? showId;
}

/** Действует ли на брони сеанса скидка лояльности (см. ShowInfo.loyaltyEligible). */
export function isLoyaltyEligibleShow(show: Pick<ShowInfo, 'loyaltyEligible'>): boolean {
  return show.loyaltyEligible !== false;
}

export function showDateString(show: ShowInfo): string {
  return `${show.day} ${show.month} ${show.year}`;
}

// Абсолютный момент начала спектакля (мс UTC) по данным каталога.
export function showStartUtcMs(show: ShowInfo): number | null {
  return parseShowStartUtcMs(showDateString(show), show.time);
}
