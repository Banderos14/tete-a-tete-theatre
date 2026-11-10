import type { Show, RepertoireItem } from '../types';
import { parseShowStartUtcMs, MONTH_RU } from '../../shared/domain/showTime';
import {
  SEASON_CATALOG, THEATRE_CAPACITY, productionIdOf, type ShowInfo, type TicketInfo, type TicketTypeId,
} from '../../shared/catalog/shows';
import { isShowSalesPaused } from '../../shared/catalog/salesMode';

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
// Официальные афиши театра (ноябрь 2026; «Фунтик» — новая афиша от 10.11): оригинальные JPG → WebP без обрезки,
// в исходном разрешении — весь текст афиши (название, даты, адрес) сохранён.
import duimovochkaPoster from '../assets/shows/duimovochka.webp';
import funtikPoster      from '../assets/shows/funtik.webp';
import sladostiPoster    from '../assets/shows/sladosti.webp';

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
//
// ПОСТАНОВКА С НЕСКОЛЬКИМИ СЕАНСАМИ («Фунтик», «Страна сладостей»): у сеансов
// в каталоге общий productionId, а оформление пишется ОДИН раз — с id,
// равным productionId. Все сеансы получают одну и ту же афишу и описание.

type ShowContent = Omit<Show,
  'title' | 'titleFR' | 'date' | 'day' | 'month' | 'time' | 'year'
  | 'price' | 'priceFR' | 'totalSeats' | 'ticketTypes' | 'published' | 'productionId'>;

// Предупреждение новогодних постановок — официальная формулировка театра.
const UNACCOMPANIED_NOTICE   = 'Дети до 7 лет без сопровождения взрослых не допускаются.';
const UNACCOMPANIED_NOTICEFR = 'Les enfants de moins de 7 ans ne sont pas admis sans un adulte accompagnateur.';

// Официальные описания (RU — текст театра дословно; FR — перевод без добавлений).
const DUIMOVOCHKA_DESC = [
  'Детская театральная студия культурно-образовательного центра «Созвездие» приглашает на спектакль «Дюймовочка»!',
  'В крошечном мире под огромными цветами всё как в жизни: одни знают, как тебе «будет лучше», другие судят по внешности, а кто-то готов протянуть руку в трудную минуту.',
  'И маленькой Дюймовочке предстоит большое путешествие — научиться верить в себя, найти настоящих друзей и отстоять право быть счастливой.',
  'На сцене юные актёры, которые наполняют знакомую сказку своими чувствами, юмором и мечтами.',
  'Приходите всей семьёй увидеть, как оживает сказка!',
].join('\n\n');
const DUIMOVOCHKA_DESCFR = [
  'L’atelier théâtral pour enfants du centre culturel et éducatif «Constellation» vous invite au spectacle «Poucette» !',
  'Dans un monde minuscule, sous des fleurs immenses, tout se passe comme dans la vie : certains savent mieux que toi ce qui «sera bien pour toi», d’autres jugent sur les apparences, et d’autres encore sont prêts à tendre la main dans les moments difficiles.',
  'La petite Poucette se lance dans un grand voyage : apprendre à croire en elle, trouver de vrais amis et défendre son droit au bonheur.',
  'Sur scène, de jeunes comédiens nourrissent ce conte bien connu de leurs émotions, de leur humour et de leurs rêves.',
  'Venez en famille voir le conte prendre vie !',
].join('\n\n');

const FUNTIK_DESC = [
  'Фунтик и его друзья приглашают вас в головокружительное приключение! Здесь придётся удирать от погони, выпутываться из хитрых ловушек и творить чудеса вместе с дядюшкой Мокусом.',
  'А госпожа Беладонна... О, у неё свои планы на этот праздник!',
  'Вас ждут много юмора, весёлые песни и неожиданные превращения. Сумеют ли друзья перехитрить Беладонну и встретить Новый год? Без помощи зрителей им точно не обойтись!',
  'Приходите всей семьёй — смеяться, удивляться и болеть за Фунтика!',
].join('\n\n');
const FUNTIK_DESCFR = [
  'Fountik et ses amis vous entraînent dans une aventure étourdissante ! Il faudra échapper à une course-poursuite, se tirer de pièges malins et faire des miracles avec l’oncle Mokus.',
  'Quant à Madame Beladonna… Oh, elle a ses propres projets pour cette fête !',
  'Beaucoup d’humour, de joyeuses chansons et des transformations inattendues vous attendent. Les amis réussiront-ils à déjouer Beladonna et à fêter le Nouvel An ? Sans l’aide des spectateurs, ils n’y arriveront sûrement pas !',
  'Venez en famille rire, vous émerveiller et encourager Fountik !',
].join('\n\n');

const SLADOSTI_DESC = [
  'В сладкой сказочной стране все готовятся к Новому году.',
  'Но что это? Праздник под угрозой!',
  'Отважный Снеговик и озорная фея Карамелька отправляются навстречу новым приключениям.',
  'Чтобы спасти праздник, им понадобятся маленькие помощники — наши зрители!',
  'Будем вместе петь, играть, разгадывать загадки и творить новогодние чудеса.',
  'Ведь даже самые маленькие могут сделать большое доброе дело!',
  'Приходите на тёплую, добрую сказку, в которой малыши станут участниками волшебной истории.',
].join('\n\n');
const SLADOSTI_DESCFR = [
  'Au pays enchanté des douceurs, tout le monde se prépare pour le Nouvel An.',
  'Mais que se passe-t-il ? La fête est menacée !',
  'Le courageux Bonhomme de neige et la malicieuse fée Karamelka partent vers de nouvelles aventures.',
  'Pour sauver la fête, ils auront besoin de petits assistants : nos spectateurs !',
  'Ensemble, nous allons chanter, jouer, résoudre des devinettes et faire des miracles du Nouvel An.',
  'Car même les plus petits peuvent accomplir une grande et belle action !',
  'Venez découvrir un conte chaleureux et tendre, dans lequel les tout-petits deviennent les héros d’une histoire magique.',
].join('\n\n');

const FUNTIK_AUTHOR     = 'Музыкальный спектакль · Дед Мороз и Снегурочка, игры, конкурсы и подарки';
const FUNTIK_AUTHORFR   = 'Spectacle musical · Ded Moroz et Snegourotchka, jeux, concours et cadeaux';
const SLADOSTI_AUTHOR   = 'Музыкальный спектакль для малышей от 1 года до 6 лет · Дед Мороз и Снегурочка, игры, конкурсы и подарки';
const SLADOSTI_AUTHORFR = 'Spectacle musical pour les tout-petits de 1 à 6 ans · Ded Moroz et Snegourotchka, jeux, concours et cadeaux';
const DUIMOVOCHKA_AUTHOR   = 'Детская театральная студия КОЦ «Созвездие»';
const DUIMOVOCHKA_AUTHORFR = 'Atelier théâtral pour enfants du centre «Constellation»';

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
    // Возрастного ограничения театр не указал — штамп возраста не рисуется.
    id: 'duimovochka',
    author: DUIMOVOCHKA_AUTHOR, authorFR: DUIMOVOCHKA_AUTHORFR,
    age: '',
    duration: '1 час', durationFR: '1 h',
    desc: DUIMOVOCHKA_DESC, descFR: DUIMOVOCHKA_DESCFR,
    palette: 'var(--ph-5)',
    image: duimovochkaPoster,
    imageFit: 'contain',
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
  // ── Постановки с несколькими сеансами: id = productionId ──
  {
    id: 'funtik',
    author: FUNTIK_AUTHOR, authorFR: FUNTIK_AUTHORFR,
    age: '4+',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
    desc: FUNTIK_DESC, descFR: FUNTIK_DESCFR,
    notice: UNACCOMPANIED_NOTICE, noticeFR: UNACCOMPANIED_NOTICEFR,
    palette: 'var(--ph-2)',
    image: funtikPoster,
    imageFit: 'contain',
  },
  {
    // Рейтинг 1+ — спектакль для малышей; предупреждение о сопровождении
    // взрослого не превращает его в 7+.
    id: 'sladosti',
    author: SLADOSTI_AUTHOR, authorFR: SLADOSTI_AUTHORFR,
    age: '1+',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
    desc: SLADOSTI_DESC, descFR: SLADOSTI_DESCFR,
    notice: UNACCOMPANIED_NOTICE, noticeFR: UNACCOMPANIED_NOTICEFR,
    palette: 'var(--ph-3)',
    image: sladostiPoster,
    imageFit: 'contain',
  },
];

// Подпись цены в карточке: «30 € / 20 € (ученики и студенты)». Строится из
// тарифов каталога — цифры на сайте не могут разойтись с серверными.
const PRICE_NOTE: Partial<Record<TicketTypeId, { RU: string; FR: string }>> = {
  student: { RU: 'ученики и студенты',   FR: 'scolaires et étudiants' },
  child:   { RU: 'ребёнок',              FR: 'enfant' },
  adult:   { RU: 'взрослый',             FR: 'adulte' },
  family:  { RU: 'ребёнок + 2 родителя', FR: 'enfant + 2 parents' },
  constellation: { RU: 'дети «Созвездия»', FR: 'enfants de Constellation' },
  regular:       { RU: 'взрослые и дети',  FR: 'adultes et enfants' },
};

export function priceSummary(tickets: ShowInfo['tickets'], lang: 'RU' | 'FR'): string {
  const list = Object.values(tickets).filter((t): t is TicketInfo => !!t);
  // Пакеты (новогодние постановки): двенадцать цен в строку не помещаются —
  // «от 35 €», а полный список с составом пакетов показывает форма брони.
  if (list.some(t => typeof t.gifts === 'number')) {
    const min = Math.min(...list.map(t => t.price));
    return lang === 'FR' ? `dès ${min} €` : `от ${min} €`;
  }
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
    productionId: productionIdOf(id, info),
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
    ...(info.loyaltyEligible === false ? { loyaltyEligible: false } : {}),
    ticketTypes: (Object.entries(info.tickets) as Array<[TicketTypeId, TicketInfo]>).map(([ticketId, t]) => ({
      id: ticketId, label: t.label, labelFR: t.labelFR, price: t.price, seats: t.seats,
      ...(t.hint ? { hint: t.hint, hintFR: t.hintFR } : {}),
      ...(typeof t.gifts === 'number' ? { adults: t.adults, children: t.children, gifts: t.gifts } : {}),
      ...(t.group ? { group: t.group } : {}),
      // Сколько единиц тарифа помещается в зал (семейный — по 3 места).
      available: Math.floor(THEATRE_CAPACITY / t.seats),
    })),
  };
}

const CONTENT_BY_ID = new Map(SHOW_CONTENT.map(c => [c.id, c]));

/** Весь сезон — в порядке каталога, опубликованные и заготовки. */
export const SHOWS: Show[] = Object.entries(SEASON_CATALOG)
  // Оформление сеанса — своё по id, иначе общее для постановки.
  .map(([id, info]) => buildShow(id, info, CONTENT_BY_ID.get(id) ?? CONTENT_BY_ID.get(productionIdOf(id, info))));

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
    id: 'shutka', status: 'past',
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
    id: 'lubov', status: 'past',
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
    id: 'korablik', status: 'past',
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
    id: 'razgovor', status: 'past',
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
    id: 'enot', status: 'past',
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
    id: 'duimovochka', status: 'active',
    author: DUIMOVOCHKA_AUTHOR, authorFR: DUIMOVOCHKA_AUTHORFR,
    tag: 'Сказка', age: '',
    palette: 'var(--ph-5)',
    image: duimovochkaPoster,
    imageFit: 'contain',
    description: DUIMOVOCHKA_DESC, descriptionFR: DUIMOVOCHKA_DESCFR,
    duration: '1 час', durationFR: '1 h',
  },
  {
    id: 'kovcheg', status: 'past',
    author: 'Урлих Хуб',
    authorFR: 'Ulrich Hub',
    tag: 'Мюзикл', age: '6+',
    image: kovchegPoster,
    palette: 'var(--ph-4)',
    description: 'Музыкальный спектакль для всей семьи по пьесе Урлиха Хуба.',
    descriptionFR: 'Un spectacle musical pour toute la famille d’après la pièce d’Ulrich Hub.',
    duration: '1 час 20 минут (с антрактом)', durationFR: '1 h 20 (avec entracte)',
  },
  // Постановки с несколькими сеансами — ОДНА карточка на постановку (id =
  // productionId); даты всех сеансов берутся из каталога.
  {
    id: 'funtik', status: 'active',
    author: FUNTIK_AUTHOR, authorFR: FUNTIK_AUTHORFR,
    tag: 'Мюзикл', age: '4+',
    palette: 'var(--ph-2)',
    image: funtikPoster,
    imageFit: 'contain',
    description: FUNTIK_DESC, descriptionFR: FUNTIK_DESCFR,
    notice: UNACCOMPANIED_NOTICE, noticeFR: UNACCOMPANIED_NOTICEFR,
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
  },
  {
    id: 'sladosti', status: 'active',
    author: SLADOSTI_AUTHOR, authorFR: SLADOSTI_AUTHORFR,
    tag: 'Сказка', age: '1+',
    palette: 'var(--ph-3)',
    image: sladostiPoster,
    imageFit: 'contain',
    description: SLADOSTI_DESC, descriptionFR: SLADOSTI_DESCFR,
    notice: UNACCOMPANIED_NOTICE, noticeFR: UNACCOMPANIED_NOTICEFR,
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
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
  // Карточка постановки с несколькими сеансами (id = productionId) берёт
  // название и публикацию у её сеансов: опубликован хотя бы один — видна.
  const sessions = Object.values(SEASON_CATALOG).filter(s => s.productionId === item.id);
  if (!SEASON_CATALOG[item.id] && sessions.length) {
    const first = sessions[0]!;
    return { ...item, title: first.title, titleFR: first.titleFR, published: sessions.some(s => s.published) };
  }
  const info = SEASON_CATALOG[item.id];
  return info
    ? { ...item, title: info.title, titleFR: info.titleFR, published: info.published }
    : { ...item, title: item.title ?? item.id };
}

// Сначала идущие постановки, потом прошедшие (порядок внутри групп — как в
// REPERTOIRE_CONTENT): прошедший спектакль не должен стоять между афишными.
export const REPERTOIRE: RepertoireItem[] = REPERTOIRE_CONTENT
  .map(buildRepertoireItem)
  .sort((a, b) => Number(a.status === 'past') - Number(b.status === 'past'));

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

// ─────────────────────────────────────────────────────────────────────────────
// Афиша = только предстоящие спектакли
//
// Афиша показывает опубликованные спектакли, которые ЕЩЁ НЕ НАЧАЛИСЬ: момент
// начала считается по дате и времени каталога как настенное время
// Europe/Paris (isShowPast выше — та же функция, что у сервера). Прошедший
// спектакль исчезает из Афиши сам, без ручных флагов, но остаётся в каталоге,
// в Репертуаре, в «Моих билетах» и в админке.
//
// Закрытые ограниченным режимом продаж спектакли (shared/catalog/salesMode.ts)
// здесь НЕ фильтруются: будущий спектакль остаётся в Афише, просто без покупки.

/** Спектакль ещё не начался. Дату, которую нельзя разобрать, считаем предстоящей — как isShowPast. */
export function isShowUpcoming(show: Pick<Show, 'day' | 'month' | 'year' | 'time'>, nowMs: number = Date.now()): boolean {
  return !isShowPast(show, nowMs);
}

const startMsOf = (s: Pick<Show, 'day' | 'month' | 'year' | 'time'>): number =>
  parseShowStartUtcMs(`${s.day} ${s.month} ${s.year}`, s.time) ?? Number.POSITIVE_INFINITY;

/** Все опубликованные сеансы постановки — по времени начала. */
export function productionSessions(productionId: string): Show[] {
  return PUBLISHED_SHOWS.filter(s => s.productionId === productionId).sort((a, b) => startMsOf(a) - startMsOf(b));
}

/** Предстоящие сеансы постановки на момент nowMs. Прошедший сеанс купить нельзя — его здесь нет. */
export function upcomingSessions(productionId: string, nowMs: number = Date.now()): Show[] {
  return productionSessions(productionId).filter(s => isShowUpcoming(s, nowMs));
}

/**
 * Сеанс, которым постановка представлена в карточке: ближайший предстоящий,
 * а если все прошли — последний (для Репертуара и истории). null — у
 * постановки нет опубликованных сеансов.
 */
export function productionRepresentative(productionId: string, nowMs: number = Date.now()): Show | null {
  const all = productionSessions(productionId);
  return all.find(s => isShowUpcoming(s, nowMs)) ?? all[all.length - 1] ?? null;
}

/**
 * Спектакли Афиши на момент nowMs — опубликованные и предстоящие, по одной
 * карточке на ПОСТАНОВКУ: у «Фунтика» шесть сеансов, но в Афише одна карточка
 * с ближайшим из них; остальные даты выбираются в модалке. Порядок — по
 * ближайшему сеансу (у спектаклей с одним показом это порядок каталога).
 */
export function afishaShows(nowMs: number = Date.now()): Show[] {
  const seen = new Set<string>();
  return PUBLISHED_SHOWS
    .filter(show => isShowUpcoming(show, nowMs))
    // Закрытые ограниченным режимом продаж в Афишу не попадают (решение
    // театра, ноябрь 2026): в Афише только то, что можно купить. Сами
    // спектакли остаются в каталоге, Репертуаре, админке и у броней.
    .filter(show => !isShowSalesPaused(show.id))
    .sort((a, b) => startMsOf(a) - startMsOf(b))
    .filter((show) => {
      if (seen.has(show.productionId)) return false;
      seen.add(show.productionId);
      return true;
    });
}

/**
 * Начальный год сезона (сентябрь—июль): у январского сеанса 2027 года сезон
 * всё ещё «2026 / 2027», а не «2027 / 2028».
 */
export function seasonStartYear(show: Pick<Show, 'month' | 'year'>): number | null {
  const year = Number(show.year);
  if (!Number.isFinite(year)) return null;
  const month = MONTH_RU[show.month];
  return month !== undefined && month < 7 ? year - 1 : year;
}
export const PUBLISHED_REPERTOIRE: RepertoireItem[] = publishedOnly(REPERTOIRE);
