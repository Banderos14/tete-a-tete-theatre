import type { Show, RepertoireItem } from '../types';
import { parseShowStartUtcMs, MONTH_RU } from '../../shared/domain/showTime';
import {
  SEASON_CATALOG, THEATRE_CAPACITY, type ShowInfo, type TicketInfo, type TicketTypeId,
} from '../../shared/catalog/shows';

// Постеры спектаклей — ЕДИНСТВЕННОЕ место, где файл связывается со спектаклем.
// SHOWS и REPERTOIRE ниже ссылаются на эти же константы, а Афиша, Репертуар,
// ShowModal, BookingModal, кабинет и админка читают `image` из них.
//
// Файлы импортируются через Vite, а не лежат в public/: в сборке имя получает
// content-hash (/assets/lubov-XXXX.webp). /images/* и /assets/* отдаются
// с `immutable` на год, поэтому замена файла в public/ под тем же именем
// до зрителей не доходила — CDN и браузеры продолжали показывать старую афишу.
// Новый файл = новый хеш = новый URL, кеш сбрасывать не нужно.
import romantikaPoster from '../assets/shows/romantika.webp';
import shutkaPoster    from '../assets/shows/shutka.webp';
import korablikPoster  from '../assets/shows/korablik.webp';
import razgovorPoster  from '../assets/shows/razgovor.webp';
import enotPoster      from '../assets/shows/enot.webp';
import lubovPoster     from '../assets/shows/lubov.webp';
import shapochkaPoster from '../assets/shows/shapochka.webp';
import kovchegPoster   from '../assets/shows/kovcheg8.webp';
import nulinPoster     from '../assets/shows/nulin.webp';

// Спектакль уже начался? Время считается как настенное Europe/Paris —
// той же функцией, которой пользуется сервер, чтобы клиент и сервер не расходились.
export function isShowPast(show: Pick<Show, 'day' | 'month' | 'year' | 'time'>, nowMs: number = Date.now()): boolean {
  const start = parseShowStartUtcMs(`${show.day} ${show.month} ${show.year}`, show.time);
  return start !== null && start <= nowMs;
}

const showPhoto = (fileName: string) => `${import.meta.env.BASE_URL}images/showPhotos/${fileName}`;

// imagePosition двигает постер внутри рамки (CSS background-position / object-position):
//   "center center"  — по умолчанию, центр кадра
//   "center 30%"     — поднимает кадр выше (лица/верх в фокусе)
//   "center 70%"     — опускает кадр ниже
//   "top center"     — верхний край фото
//   "center bottom"  — нижний край фото
// Применяется к карточке в Афише и главному фото в модалке спектакля.
// Пример: добавь  imagePosition: 'center 30%'  в нужный спектакль.
//
// Для позиционирования конкретных фото в галерее модалки используй объект вместо строки:
//   photos: [
//     showPhoto('photo1.webp'),   // строка — defaults: position center center, без доп. масштаба
//     {
//       src: showPhoto('photo2.webp'),
//       position: 'center 35%',  // сдвигает фокус (object-position), работает на desktop и mobile
//       mobileScale: 1.35,       // увеличивает фото только на мобиле: 1.2 = +20%, 1.4 = +40%
//     },
//   ]
// Desktop всегда показывает фото целиком (object-fit: contain).
// Mobile использует object-fit: cover + mobileScale для крупного кадра.

// ─────────────────────────────────────────────────────────────────────────────
// Спектакли афиши
//
// ЕДИНЫЙ ИСТОЧНИК ФАКТОВ — серверный каталог shared/catalog/shows.ts
// (SEASON_CATALOG): id, название RU/FR, дата и время, опубликован ли спектакль,
// тарифы и цены, вместимость. Здесь эти данные НЕ повторяются — только
// оформление, которое серверу не нужно: постер, фото, описание, возраст,
// длительность, подпись автора, цвет подложки.
//
// SHOWS ниже собирается из каталога + оформления по showId. Афиша, Репертуар,
// форма брони, кабинет, админка и сканер читают одно и то же: спектакль,
// скрытый в каталоге (published: false), скрыт везде, а цены на сайте всегда
// те, по которым считает сервер.
//
// НОВЫЙ СПЕКТАКЛЬ: 1) запись в SEASON_CATALOG (факты); 2) запись здесь, в
// SHOW_CONTENT (оформление), с тем же id. Больше нигде ничего менять не нужно.

type ShowContent = Omit<Show,
  'title' | 'titleFR' | 'date' | 'day' | 'month' | 'time' | 'year'
  | 'price' | 'priceFR' | 'totalSeats' | 'ticketTypes' | 'published'>;

const SHOW_CONTENT: ShowContent[] = [
  {
    id: 'romantika',
    author: 'Цветаева · Жизнь и творчество',
    authorFR: 'Tsvetaïeva · Vie et œuvre',
    age: '10+',
    duration: '1 час (без антракта)', durationFR: '1 h (sans entracte)',
    desc:   'Литературно-музыкальный спектакль по биографии Марины Цветаевой.',
    descFR: 'Spectacle littéraire et musical consacré à la biographie de Marina Tsvetaïeva.',
    palette: 'var(--ph-1)',
    image: romantikaPoster,
    photos: [
      { src: showPhoto('romantika1.webp'), position: 'center 50%', size: '110%' },
      { src: showPhoto('romantika2.webp'), position: 'left 60%', size: '130%' },
      { src: showPhoto('romantika3.webp'), position: 'center 35%', size: '100%' },
      { src: showPhoto('romantika4.webp'), position: 'center 70%', size: '150%' },
    ],
  },
  {
    id: 'shutka',
    author: 'А. П. Чехов · Две комедии',
    authorFR: 'A. P. Tchekhov · Deux comédies',
    age: '10+',
    duration: '1 час 10 минут (с антрактом)', durationFR: '1 h 10 (avec entracte)',
    desc:   'Две комедии А. П. Чехова — «Юбилей» и «Предложение».',
    descFR: 'Deux comédies d’Anton Tchekhov — «L’Anniversaire» et «La Demande en mariage».',
    palette: 'var(--ph-2)',
    image: shutkaPoster,
    photos: [
      { src: showPhoto('shutka1.webp'), position: 'center 20%', mobileScale: 1},
      { src: showPhoto('shutka2.webp'), position: 'center 30%', mobileScale: 1},
      { src: showPhoto('shutka3.webp'), position: 'center 35%', mobileScale: 1},
      { src: showPhoto('shutka4.webp'), position: 'center 25%', mobileScale: 1},
      { src: showPhoto('shutka5.webp'), position: 'center 30%', mobileScale: 1},
    ],
  },
  {
    id: 'korablik',
    author: 'Интерактивный детский спектакль',
    authorFR: 'Spectacle interactif pour enfants',
    age: '1+',
    duration: '45 минут', durationFR: '45 min',
    desc: 'Интерактивный детский спектакль о путешествии маленького кораблика.',
    descFR: 'Un spectacle interactif pour enfants sur le voyage d’un petit bateau.',
    palette: 'var(--ph-3)',
    image: korablikPoster,
  },
  {
    id: 'razgovor',
    author: 'Р. Белецкий · Трагикомедия',
    authorFR: 'R. Beletski · Tragicomédie',
    age: '12+',
    duration: '1 час 10 минут (без антракта)', durationFR: '1 h 10 (sans entracte)',
    desc: 'Трагикомедия по пьесе Р. Белецкого. С юмором говорим о серьёзном, смеёмся вместе с прошлым, делаем выводы на будущее.',
    descFR: 'Tragicomédie d’après la pièce de R. Beletski. Nous parlons avec humour de choses sérieuses, rions avec le passé et en tirons des leçons pour l’avenir.',
    palette: 'var(--ph-4)',
    image: razgovorPoster,
  },
  {
    id: 'enot',
    author: 'Театр «Маленькая белая рыбка» · Канны',
    authorFR: 'Théâtre «Le Petit Poisson blanc» · Cannes',
    age: '3+',
    duration: '45 минут', durationFR: '45 min',
    desc: 'Кукольный спектакль театра «Маленькая белая рыбка» из Канн. Добрая сказка о смелости и дружбе для детей и для взрослых, которые ещё помнят, как быть детьми!',
    descFR: 'Spectacle de marionnettes du théâtre «Le Petit Poisson blanc» de Cannes. Un conte plein de bonté sur le courage et l’amitié, pour les enfants et les adultes qui se souviennent encore comment être enfants.',
    palette: 'var(--ph-5)',
    image: enotPoster,
  },
  {
    id: 'lubov',
    author: 'А. Аверченко и Н. Тэффи · Пять новелл о любви',
    authorFR: 'A. Averchenko et N. Teffi · Cinq nouvelles sur l’amour',
    age: '12+',
    duration: '1 час 30 минут (с антрактом)', durationFR: '1 h 30 (avec entracte)',
    desc: 'Спектакль по рассказам А. Аверченко и Н. Тэффи. Пять новелл о любви.',
    descFR: 'Un spectacle d’après les récits d’A. Averchenko et de N. Teffi. Cinq nouvelles sur l’amour.',
    palette: 'var(--ph-1)',
    image: lubovPoster,
  },
  {
    id: 'shapochka',
    author: 'Театр «Маленькая белая рыбка» · Канны',
    authorFR: 'Théâtre «Le Petit Poisson blanc» · Cannes',
    age: '3–7 лет',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
    desc: 'Смешные перчаточные куклы разыгрывают новую историю с хорошим завершением и учат малышей быть отзывчивыми, открытыми и готовыми всегда помочь близким!',
    descFR: 'De drôles de marionnettes à gaine jouent une nouvelle histoire qui finit bien et apprennent aux petits à être attentifs, ouverts et toujours prêts à aider leurs proches.',
    palette: 'var(--ph-2)',
    image: shapochkaPoster,
  },
  {
    id: 'letuchiy',
    author: 'Сказочный мюзикл для детей и взрослых',
    authorFR: 'Comédie musicale féerique pour enfants et adultes',
    age: '6+',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
    desc: 'Сказочный мюзикл для детей и взрослых.',
    descFR: 'Une comédie musicale féerique pour les enfants et les adultes.',
    palette: 'var(--ph-3)',
  },
  {
    id: 'kovcheg',
    author: 'Урлих Хуб · Музыкальный спектакль',
    authorFR: 'Ulrich Hub · Spectacle musical',
    age: '6+',
    duration: '1 час 20 минут (с антрактом)', durationFR: '1 h 20 (avec entracte)',
    desc: 'Музыкальный спектакль для всей семьи по пьесе Урлиха Хуба.',
    descFR: 'Un spectacle musical pour toute la famille d’après la pièce d’Ulrich Hub.',
    palette: 'var(--ph-4)',
    image: kovchegPoster,
  },
];

// Подпись цены в карточке: «30 € / 20 € (ученики и студенты)». Строится из
// тарифов каталога — цифры на сайте не могут разойтись с серверными.
const PRICE_NOTE: Partial<Record<TicketTypeId, { RU: string; FR: string }>> = {
  student: { RU: 'ученики и студенты',   FR: 'scolaires et étudiants' },
  child:   { RU: 'ребёнок',              FR: 'enfant' },
  adult:   { RU: 'взрослый',             FR: 'adulte' },
  family:  { RU: 'ребёнок + 2 родителя', FR: 'enfant + 2 parents' },
};

export function priceSummary(tickets: ShowInfo['tickets'], lang: 'RU' | 'FR'): string {
  return (Object.entries(tickets) as Array<[TicketTypeId, TicketInfo]>)
    .map(([id, t]) => (PRICE_NOTE[id] ? `${t.price} € (${PRICE_NOTE[id]![lang]})` : `${t.price} €`))
    .join(' / ');
}

/** «17.09» для карточек афиши — из дня и месяца каталога. */
function shortDate(info: ShowInfo): string {
  const month = MONTH_RU[info.month];
  return `${info.day}.${String((month ?? 0) + 1).padStart(2, '0')}`;
}

/** Спектакль сайта = факты каталога + оформление. */
export function buildShow(id: string, info: ShowInfo, content: ShowContent | undefined): Show {
  return {
    // Без оформления (оно ещё не написано) — нейтральная подложка вместо постера.
    palette: 'var(--ph-1)', author: '', desc: '', descFR: '', duration: '', age: '',
    ...content,
    id,
    title:   info.title,
    titleFR: info.titleFR,
    date:    shortDate(info),
    day:     info.day,
    month:   info.month as Show['month'],
    time:    info.time,
    year:    info.year,
    price:   priceSummary(info.tickets, 'RU'),
    priceFR: priceSummary(info.tickets, 'FR'),
    totalSeats: THEATRE_CAPACITY,
    published:  info.published,
    ticketTypes: (Object.entries(info.tickets) as Array<[TicketTypeId, TicketInfo]>).map(([ticketId, t]) => ({
      id: ticketId, label: t.label, labelFR: t.labelFR, price: t.price, seats: t.seats,
      // Сколько единиц тарифа помещается в зал (семейный — по 3 места).
      available: Math.floor(THEATRE_CAPACITY / t.seats),
    })),
  };
}

const CONTENT_BY_ID = new Map(SHOW_CONTENT.map(c => [c.id, c]));

/** Весь сезон — в порядке каталога, опубликованные и заготовки. */
export const SHOWS: Show[] = Object.entries(SEASON_CATALOG)
  .map(([id, info]) => buildShow(id, info, CONTENT_BY_ID.get(id)));

// ─────────────────────────────────────────────────────────────────────────────
// Репертуар — постановки театра (в том числе прошедшие и без даты в сезоне).
//
// У постановки, которая есть в каталоге сезона, название и признак публикации
// берутся ИЗ КАТАЛОГА: одна правка published в SEASON_CATALOG скрывает её и в
// Афише, и в Репертуаре. Своё название пишется только у постановок вне
// каталога (прошедшие, «Граф Нулин»).
type RepertoireContent = Omit<RepertoireItem, 'title' | 'titleFR' | 'published'>
  & Partial<Pick<RepertoireItem, 'title' | 'titleFR'>>;

const REPERTOIRE_CONTENT: RepertoireContent[] = [
  // ── Активные — постановка идёт в этом сезоне. Дата и кнопка «Купить билет»
  //    появляются, только если спектакль есть в SHOWS; иначе карточка пишет «скоро».
  {
    id: 'romantika', status: 'active',
    author: 'Марина Цветаева',
    authorFR: 'Marina Tsvetaïeva',
    tag: 'Поэзия', age: '10+',
    palette: 'var(--ph-1)',
    image: romantikaPoster,
    imagePosition: 'center 53%',
    description: 'Литературно-музыкальный спектакль по биографии Марины Цветаевой.',
    descriptionFR: 'Spectacle littéraire et musical consacré à la biographie de Marina Tsvetaïeva.',
    duration: '1 час (без антракта)', durationFR: '1 h (sans entracte)',
  },
  {
    id: 'shutka', status: 'active',
    author: 'А. П. Чехов',
    authorFR: 'A. P. Tchekhov',
    tag: 'Комедия', age: '10+',
    palette: 'var(--ph-2)',
    image: shutkaPoster,
    description: 'Две комедии А. П. Чехова — «Юбилей» и «Предложение».',
    descriptionFR: 'Deux comédies d’Anton Tchekhov — «L’Anniversaire» et «La Demande en mariage».',
    duration: '1 час 10 минут (с антрактом)', durationFR: '1 h 10 (avec entracte)',
  },
  {
    id: 'lubov', status: 'active',
    author: 'А. Аверченко и Н. Тэффи',
    authorFR: 'A. Averchenko et N. Teffi',
    tag: 'Комедия', age: '12+',
    palette: 'var(--ph-1)',
    image: lubovPoster,
    description: 'Спектакль по рассказам А. Аверченко и Н. Тэффи. Пять новелл о любви.',
    descriptionFR: 'Un spectacle d’après les récits d’A. Averchenko et de N. Teffi. Cinq nouvelles sur l’amour.',
    duration: '1 час 30 минут (с антрактом)', durationFR: '1 h 30 (avec entracte)',
  },
  {
    id: 'korablik', status: 'active',
    author: 'Интерактивный детский спектакль',
    authorFR: 'Spectacle interactif pour enfants',
    tag: 'Сказка', age: '1+',
    palette: 'var(--ph-3)',
    image: korablikPoster,
    description: 'Интерактивный детский спектакль о путешествии маленького кораблика.',
    descriptionFR: 'Un spectacle interactif pour enfants sur le voyage d’un petit bateau.',
    duration: '45 минут', durationFR: '45 min',
  },
  {
    id: 'razgovor', status: 'active',
    author: 'Р. Белецкий',
    authorFR: 'R. Beletski',
    tag: 'Драма', age: '12+',
    palette: 'var(--ph-4)',
    image: razgovorPoster,
    description: 'Трагикомедия по пьесе Р. Белецкого. С юмором говорим о серьёзном, смеёмся вместе с прошлым, делаем выводы на будущее.',
    descriptionFR: 'Tragicomédie d’après la pièce de R. Beletski. Nous parlons avec humour de choses sérieuses, rions avec le passé et en tirons des leçons pour l’avenir.',
    duration: '1 час 10 минут (без антракта)', durationFR: '1 h 10 (sans entracte)',
  },
  {
    id: 'enot', status: 'active',
    author: 'Театр «Маленькая белая рыбка» · Канны',
    authorFR: 'Théâtre «Le Petit Poisson blanc» · Cannes',
    tag: 'Сказка', age: '3+',
    palette: 'var(--ph-5)',
    image: enotPoster,
    description: 'Добрая кукольная сказка о смелости и дружбе для детей и взрослых, которые ещё помнят, как быть детьми.',
    descriptionFR: 'Un tendre conte de marionnettes sur le courage et l’amitié, pour les enfants et les adultes qui se souviennent encore comment être enfants.',
    duration: '45 минут', durationFR: '45 min',
  },
  {
    id: 'shapochka', status: 'active',
    author: 'Театр «Маленькая белая рыбка» · Канны',
    authorFR: 'Théâtre «Le Petit Poisson blanc» · Cannes',
    tag: 'Сказка', age: '3–7 лет',
    palette: 'var(--ph-2)',
    image: shapochkaPoster,
    description: 'Смешные перчаточные куклы разыгрывают новую историю с хорошим завершением и учат малышей быть отзывчивыми, открытыми и готовыми всегда помочь близким!',
    descriptionFR: 'De drôles de marionnettes à gaine jouent une nouvelle histoire qui finit bien et apprennent aux petits à être attentifs, ouverts et toujours prêts à aider leurs proches.',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
  },
  {
    id: 'letuchiy', status: 'active',
    author: 'Сказочный мюзикл',
    authorFR: 'Comédie musicale féerique',
    tag: 'Мюзикл', age: '6+',
    palette: 'var(--ph-3)',
    description: 'Сказочный мюзикл для детей и взрослых.',
    descriptionFR: 'Une comédie musicale féerique pour les enfants et les adultes.',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
  },
  {
    id: 'kovcheg', status: 'active',
    author: 'Урлих Хуб',
    authorFR: 'Ulrich Hub',
    tag: 'Мюзикл', age: '6+',
    image: kovchegPoster,
    palette: 'var(--ph-4)',
    description: 'Музыкальный спектакль для всей семьи по пьесе Урлиха Хуба.',
    descriptionFR: 'Un spectacle musical pour toute la famille d’après la pièce d’Ulrich Hub.',
    duration: '1 час 20 минут (с антрактом)', durationFR: '1 h 20 (avec entracte)',
  },

  // ── Прошедшие — нет в SHOWS, кнопки «Купить билет» не будет ── status: 'past'
  {
    id: 'nulin', status: 'past',
    title: '«Граф Нулин»',
    titleFR: '«Le Comte Nouline»',
    author: 'А. С. Пушкин',
    authorFR: 'A. S. Pouchkine',
    tag: 'Поэма', age: '12+',
    palette: 'var(--ph-1)',
    image: nulinPoster,
    imagePosition: 'center 30%',
    description: 'Лёгкая и остроумная поэма в театральном прочтении. Смешное и лирическое переплетаются так же легко, как строки Пушкина. Вечер для тех, кто любит слово.',
    descriptionFR: "Un poème léger et plein d'esprit. Le comique et le lyrique s'entrelacent comme les vers de Pouchkine. Une soirée pour ceux qui aiment les mots.",
    duration: '1 ч 10 мин (с антрактом)', durationFR: '1 h 10 min (avec entracte)',
  },
];

/** Постановка репертуара с названием и публикацией из каталога сезона. */
export function buildRepertoireItem(item: RepertoireContent): RepertoireItem {
  const info = SEASON_CATALOG[item.id];
  return info
    ? { ...item, title: info.title, titleFR: info.titleFR, published: info.published }
    : { ...item, title: item.title ?? item.id };
}

export const REPERTOIRE: RepertoireItem[] = REPERTOIRE_CONTENT.map(buildRepertoireItem);

// ─────────────────────────────────────────────────────────────────────────────
// Что показывать публично
//
// Признак публикации — ОДИН, в каталоге (SEASON_CATALOG[id].published).
// Неопубликованный спектакль (заготовка: постера ещё нет) остаётся в SHOWS
// целиком — по нему читаются старые брони и история посещений, — но не
// попадает ни в Афишу, ни в Репертуар, ни в админку/сканер как активный,
// а сервер не продаёт на него билеты.
//
// ЧТОБЫ ОПУБЛИКОВАТЬ СПЕКТАКЛЬ: положить постер в src/assets/shows/,
// импортировать и указать `image` в SHOW_CONTENT (и в REPERTOIRE_CONTENT),
// затем в SEASON_CATALOG поставить `published: true`.
//
// Весь каталог (SHOWS/REPERTOIRE) берут только чтение старых броней, deep-link
// и история посещений; Афиша, Репертуар, рассылка и админка — PUBLISHED_*.
export function publishedOnly<T extends { published?: boolean }>(items: readonly T[]): T[] {
  return items.filter(item => item.published !== false);
}

export const PUBLISHED_SHOWS: Show[] = publishedOnly(SHOWS);
export const PUBLISHED_REPERTOIRE: RepertoireItem[] = publishedOnly(REPERTOIRE);
