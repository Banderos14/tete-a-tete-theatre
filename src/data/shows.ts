import type { Show, DraftShow, RepertoireItem } from '../types';
import { parseShowStartUtcMs } from '../../shared/domain/showTime';

// Спектакль уже начался? Время считается как настенное Europe/Paris —
// той же функцией, которой пользуется сервер, чтобы клиент и сервер не расходились.
export function isShowPast(show: Pick<Show, 'day' | 'month' | 'year' | 'time'>, nowMs: number = Date.now()): boolean {
  const start = parseShowStartUtcMs(`${show.day} ${show.month} ${show.year}`, show.time);
  return start !== null && start <= nowMs;
}

const showImage = (fileName: string) => `${import.meta.env.BASE_URL}images/shows/${fileName}`;
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

export const SHOWS: Show[] = [
  {
    id: 'romantika',
    title: '«Романтика обреченности»',
    titleFR: '«La Romanesque de la Fatalité»',
    author: 'Цветаева · Жизнь и творчество',
    authorFR: 'Tsvetaïeva · Vie et œuvre',
    date: '17.09', day: '17', month: 'Сен', time: '20:00', year: '2026',
    age: '10+', price: '20 € / 15 € (ученики и студенты)', priceFR: '20 € / 15 € (scolaires et étudiants)',
    duration: '1 час (без антракта)', durationFR: '1 h (sans entracte)',
    desc:   'Литературно-музыкальный спектакль по биографии Марины Цветаевой.',
    descFR: 'Spectacle littéraire et musical consacré à la biographie de Marina Tsvetaïeva.',
    palette: 'var(--ph-1)',
    image: showImage('romantika.webp'),
    photos: [
      { src: showPhoto('romantika1.webp'), position: 'center 50%', size: '110%' },
      { src: showPhoto('romantika2.webp'), position: 'left 60%', size: '130%' },
      { src: showPhoto('romantika3.webp'), position: 'center 35%', size: '100%' },
      { src: showPhoto('romantika4.webp'), position: 'center 70%', size: '150%' },
    ],
    totalSeats: 50,
    ticketTypes: [
      { id: 'standard', label: 'Обычный', labelFR: 'Plein tarif', price: 20, available: 50, seats: 1 },
      { id: 'student',  label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 15, available: 50, seats: 1 },
    ],
  },
  {
    id: 'shutka',
    title: '«И в шутку, и всерьёз»',
    titleFR: '«Sérieusement ou pas»',
    author: 'А. П. Чехов · Две комедии',
    authorFR: 'A. P. Tchekhov · Deux comédies',
    date: '02.10', day: '02', month: 'Окт', time: '20:00', year: '2026',
    age: '10+', price: '30 € / 20 € (ученики и студенты)', priceFR: '30 € / 20 € (scolaires et étudiants)',
    duration: '1 час 10 минут (с антрактом)', durationFR: '1 h 10 (avec entracte)',
    desc:   'Две комедии А. П. Чехова — «Юбилей» и «Предложение».',
    descFR: 'Deux comédies d’Anton Tchekhov — «L’Anniversaire» et «La Demande en mariage».',
    palette: 'var(--ph-2)',
    image: showImage('shutka.webp'),
    photos: [
      { src: showPhoto('shutka1.webp'), position: 'center 20%', mobileScale: 1},
      { src: showPhoto('shutka2.webp'), position: 'center 30%', mobileScale: 1},
      { src: showPhoto('shutka3.webp'), position: 'center 35%', mobileScale: 1},
      { src: showPhoto('shutka4.webp'), position: 'center 25%', mobileScale: 1},
      { src: showPhoto('shutka5.webp'), position: 'center 30%', mobileScale: 1},
    ],
    totalSeats: 50,
    ticketTypes: [
      { id: 'standard', label: 'Обычный', labelFR: 'Plein tarif', price: 30, available: 50, seats: 1 },
      { id: 'student',  label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, available: 50, seats: 1 },
    ],
  },
  {
    id: 'korablik',
    title: '«Приключения кораблика»',
    titleFR: '«Les Aventures du petit bateau»',
    author: 'Интерактивный детский спектакль',
    authorFR: 'Spectacle interactif pour enfants',
    date: '04.10', day: '04', month: 'Окт', time: '10:00', year: '2026',
    age: '1+',
    price: '20 € (ребёнок) / 15 € (взрослый) / 45 € (ребёнок + 2 родителя)',
    priceFR: '20 € (enfant) / 15 € (adulte) / 45 € (enfant + 2 parents)',
    duration: '45 минут', durationFR: '45 min',
    desc: 'Интерактивный детский спектакль о путешествии маленького кораблика.',
    descFR: 'Un spectacle interactif pour enfants sur le voyage d’un petit bateau.',
    palette: 'var(--ph-3)',
    image: showImage('korablik.webp'),
    totalSeats: 50,
    ticketTypes: [
      { id: 'child',  label: 'Ребёнок', labelFR: 'Enfant', price: 20, available: 50, seats: 1 },
      { id: 'adult',  label: 'Взрослый', labelFR: 'Adulte', price: 15, available: 50, seats: 1 },
      { id: 'family', label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, available: 16, seats: 3 },
    ],
  },
  {
    id: 'razgovor',
    title: '«Разговор, которого не было»',
    titleFR: '«La conversation qui n\'a pas eu lieu»',
    author: 'Р. Белецкий · Трагикомедия',
    authorFR: 'R. Beletski · Tragicomédie',
    date: '16.10', day: '16', month: 'Окт', time: '20:00', year: '2026',
    age: '12+', price: '25 € / 20 € (ученики и студенты)', priceFR: '25 € / 20 € (scolaires et étudiants)',
    duration: '1 час 10 минут (без антракта)', durationFR: '1 h 10 (sans entracte)',
    desc: 'Трагикомедия по пьесе Р. Белецкого. С юмором говорим о серьёзном, смеёмся вместе с прошлым, делаем выводы на будущее.',
    descFR: 'Tragicomédie d’après la pièce de R. Beletski. Nous parlons avec humour de choses sérieuses, rions avec le passé et en tirons des leçons pour l’avenir.',
    palette: 'var(--ph-4)',
    image: showImage('razgovor.webp'),
    totalSeats: 50,
    ticketTypes: [
      { id: 'standard', label: 'Обычный', labelFR: 'Plein tarif', price: 25, available: 50, seats: 1 },
      { id: 'student',  label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, available: 50, seats: 1 },
    ],
  },
  {
    id: 'enot',
    title: '«Крошка Енот»',
    titleFR: '«Le Petit Raton laveur»',
    author: 'Театр «Маленькая белая рыбка» · Канны',
    authorFR: 'Théâtre «Le Petit Poisson blanc» · Cannes',
    date: '18.10', day: '18', month: 'Окт', time: '10:00', year: '2026',
    age: '3+',
    price: '20 € (ребёнок) / 15 € (взрослый) / 45 € (ребёнок + 2 родителя)',
    priceFR: '20 € (enfant) / 15 € (adulte) / 45 € (enfant + 2 parents)',
    duration: '45 минут', durationFR: '45 min',
    desc: 'Кукольный спектакль театра «Маленькая белая рыбка» из Канн. Добрая сказка о смелости и дружбе для детей и для взрослых, которые ещё помнят, как быть детьми!',
    descFR: 'Spectacle de marionnettes du théâtre «Le Petit Poisson blanc» de Cannes. Un conte plein de bonté sur le courage et l’amitié, pour les enfants et les adultes qui se souviennent encore comment être enfants.',
    palette: 'var(--ph-5)',
    // TODO: publish when official poster/photo is available
    published: false,
    totalSeats: 50,
    ticketTypes: [
      { id: 'child',  label: 'Ребёнок', labelFR: 'Enfant', price: 20, available: 50, seats: 1 },
      { id: 'adult',  label: 'Взрослый', labelFR: 'Adulte', price: 15, available: 50, seats: 1 },
      { id: 'family', label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, available: 16, seats: 3 },
    ],
  },
  {
    id: 'lubov',
    title: '«Счастливая любовь»',
    titleFR: '«Un amour heureux»',
    author: 'А. Аверченко и Н. Тэффи · Пять новелл о любви',
    authorFR: 'A. Averchenko et N. Teffi · Cinq nouvelles sur l’amour',
    date: '14.11', day: '14', month: 'Ноя', time: '19:00', year: '2026',
    age: '12+', price: '20 € / 15 € (ученики и студенты)', priceFR: '20 € / 15 € (scolaires et étudiants)',
    duration: '1 час 30 минут (с антрактом)', durationFR: '1 h 30 (avec entracte)',
    desc: 'Спектакль по рассказам А. Аверченко и Н. Тэффи. Пять новелл о любви.',
    descFR: 'Un spectacle d’après les récits d’A. Averchenko et de N. Teffi. Cinq nouvelles sur l’amour.',
    palette: 'var(--ph-1)',
    image: showImage('lubov.webp'),
    totalSeats: 50,
    ticketTypes: [
      { id: 'standard', label: 'Обычный', labelFR: 'Plein tarif', price: 20, available: 50, seats: 1 },
      { id: 'student',  label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 15, available: 50, seats: 1 },
    ],
  },
  {
    id: 'shapochka',
    title: '«Красная Шапочка»',
    titleFR: '«Le Petit Chaperon rouge»',
    author: 'Театр «Маленькая белая рыбка» · Канны',
    authorFR: 'Théâtre «Le Petit Poisson blanc» · Cannes',
    date: '15.11', day: '15', month: 'Ноя', time: '10:00', year: '2026',
    age: '3–7 лет',
    price: '20 € (ребёнок) / 15 € (взрослый) / 45 € (ребёнок + 2 родителя)',
    priceFR: '20 € (enfant) / 15 € (adulte) / 45 € (enfant + 2 parents)',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
    desc: 'Смешные перчаточные куклы разыгрывают новую историю с хорошим завершением и учат малышей быть отзывчивыми, открытыми и готовыми всегда помочь близким!',
    descFR: 'De drôles de marionnettes à gaine jouent une nouvelle histoire qui finit bien et apprennent aux petits à être attentifs, ouverts et toujours prêts à aider leurs proches.',
    palette: 'var(--ph-2)',
    // TODO: publish when official poster/photo is available
    published: false,
    totalSeats: 50,
    ticketTypes: [
      { id: 'child',  label: 'Ребёнок', labelFR: 'Enfant', price: 20, available: 50, seats: 1 },
      { id: 'adult',  label: 'Взрослый', labelFR: 'Adulte', price: 15, available: 50, seats: 1 },
      { id: 'family', label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, available: 16, seats: 3 },
    ],
  },
  {
    id: 'letuchiy',
    title: '«Летучий корабль»',
    titleFR: '«Le Vaisseau volant»',
    author: 'Сказочный мюзикл для детей и взрослых',
    authorFR: 'Comédie musicale féerique pour enfants et adultes',
    date: '21.11', day: '21', month: 'Ноя', time: '19:00', year: '2026',
    age: '6+', price: '30 € / 20 € (ученики и студенты)', priceFR: '30 € / 20 € (scolaires et étudiants)',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
    desc: 'Сказочный мюзикл для детей и взрослых.',
    descFR: 'Une comédie musicale féerique pour les enfants et les adultes.',
    palette: 'var(--ph-3)',
    // TODO: publish when official poster/photo is available
    published: false,
    totalSeats: 50,
    ticketTypes: [
      { id: 'standard', label: 'Обычный', labelFR: 'Plein tarif', price: 30, available: 50, seats: 1 },
      { id: 'student',  label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, available: 50, seats: 1 },
    ],
  },
  {
    id: 'kovcheg',
    title: '«У ковчега в восемь»',
    titleFR: '«À l\'arche à huit heures»',
    author: 'Урлих Хуб · Музыкальный спектакль',
    authorFR: 'Ulrich Hub · Spectacle musical',
    date: '28.11', day: '28', month: 'Ноя', time: '19:00', year: '2026',
    age: '6+', price: '30 € / 20 € (ученики и студенты)', priceFR: '30 € / 20 € (scolaires et étudiants)',
    duration: '1 час 20 минут (с антрактом)', durationFR: '1 h 20 (avec entracte)',
    desc: 'Музыкальный спектакль для всей семьи по пьесе Урлиха Хуба.',
    descFR: 'Un spectacle musical pour toute la famille d’après la pièce d’Ulrich Hub.',
    palette: 'var(--ph-4)',
    image: showImage('kovcheg8.webp'),
    totalSeats: 50,
    ticketTypes: [
      { id: 'standard', label: 'Обычный', labelFR: 'Plein tarif', price: 30, available: 50, seats: 1 },
      { id: 'student',  label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, available: 50, seats: 1 },
    ],
  },
];

export const REPERTOIRE: RepertoireItem[] = [
  // ── Активные — постановка идёт в этом сезоне. Дата и кнопка «Купить билет»
  //    появляются, только если спектакль есть в SHOWS; иначе карточка пишет «скоро».
  {
    id: 'romantika', status: 'active',
    title: '«Романтика обреченности»',
    titleFR: '«La Romanesque de la Fatalité»',
    author: 'Марина Цветаева',
    authorFR: 'Marina Tsvetaïeva',
    tag: 'Поэзия', age: '10+',
    palette: 'var(--ph-1)',
    image: showImage('romantika.webp'),
    imagePosition: 'center 53%',
    description: 'Литературно-музыкальный спектакль по биографии Марины Цветаевой.',
    descriptionFR: 'Spectacle littéraire et musical consacré à la biographie de Marina Tsvetaïeva.',
    duration: '1 час (без антракта)', durationFR: '1 h (sans entracte)',
  },
  {
    id: 'shutka', status: 'active',
    title: '«И в шутку, и всерьёз»',
    titleFR: '«Sérieusement ou pas»',
    author: 'А. П. Чехов',
    authorFR: 'A. P. Tchekhov',
    tag: 'Комедия', age: '10+',
    palette: 'var(--ph-2)',
    image: showImage('shutka.webp'),
    description: 'Две комедии А. П. Чехова — «Юбилей» и «Предложение».',
    descriptionFR: 'Deux comédies d’Anton Tchekhov — «L’Anniversaire» et «La Demande en mariage».',
    duration: '1 час 10 минут (с антрактом)', durationFR: '1 h 10 (avec entracte)',
  },
  {
    id: 'lubov', status: 'active',
    title: '«Счастливая любовь»',
    titleFR: '«Un amour heureux»',
    author: 'А. Аверченко и Н. Тэффи',
    authorFR: 'A. Averchenko et N. Teffi',
    tag: 'Комедия', age: '12+',
    palette: 'var(--ph-1)',
    image: showImage('lubov.webp'),
    description: 'Спектакль по рассказам А. Аверченко и Н. Тэффи. Пять новелл о любви.',
    descriptionFR: 'Un spectacle d’après les récits d’A. Averchenko et de N. Teffi. Cinq nouvelles sur l’amour.',
    duration: '1 час 30 минут (с антрактом)', durationFR: '1 h 30 (avec entracte)',
  },
  {
    id: 'korablik', status: 'active',
    title: '«Приключения кораблика»',
    titleFR: '«Les Aventures du petit bateau»',
    author: 'Интерактивный детский спектакль',
    authorFR: 'Spectacle interactif pour enfants',
    tag: 'Сказка', age: '1+',
    palette: 'var(--ph-3)',
    image: showImage('korablik.webp'),
    description: 'Интерактивный детский спектакль о путешествии маленького кораблика.',
    descriptionFR: 'Un spectacle interactif pour enfants sur le voyage d’un petit bateau.',
    duration: '45 минут', durationFR: '45 min',
  },
  {
    id: 'razgovor', status: 'active',
    title: '«Разговор, которого не было»',
    titleFR: '«La conversation qui n\'a pas eu lieu»',
    author: 'Р. Белецкий',
    authorFR: 'R. Beletski',
    tag: 'Драма', age: '12+',
    palette: 'var(--ph-4)',
    image: showImage('razgovor.webp'),
    description: 'Трагикомедия по пьесе Р. Белецкого. С юмором говорим о серьёзном, смеёмся вместе с прошлым, делаем выводы на будущее.',
    descriptionFR: 'Tragicomédie d’après la pièce de R. Beletski. Nous parlons avec humour de choses sérieuses, rions avec le passé et en tirons des leçons pour l’avenir.',
    duration: '1 час 10 минут (без антракта)', durationFR: '1 h 10 (sans entracte)',
  },
  {
    id: 'enot', status: 'active',
    title: '«Крошка Енот»',
    titleFR: '«Le Petit Raton laveur»',
    author: 'Театр «Маленькая белая рыбка» · Канны',
    authorFR: 'Théâtre «Le Petit Poisson blanc» · Cannes',
    tag: 'Сказка', age: '3+',
    palette: 'var(--ph-5)',
    description: 'Добрая кукольная сказка о смелости и дружбе для детей и взрослых, которые ещё помнят, как быть детьми.',
    descriptionFR: 'Un tendre conte de marionnettes sur le courage et l’amitié, pour les enfants et les adultes qui se souviennent encore comment être enfants.',
    duration: '45 минут', durationFR: '45 min',
    // TODO: publish when official poster/photo is available
    published: false,
  },
  {
    id: 'shapochka', status: 'active',
    title: '«Красная Шапочка»',
    titleFR: '«Le Petit Chaperon rouge»',
    author: 'Театр «Маленькая белая рыбка» · Канны',
    authorFR: 'Théâtre «Le Petit Poisson blanc» · Cannes',
    tag: 'Сказка', age: '3–7 лет',
    palette: 'var(--ph-2)',
    description: 'Смешные перчаточные куклы разыгрывают новую историю с хорошим завершением и учат малышей быть отзывчивыми, открытыми и готовыми всегда помочь близким!',
    descriptionFR: 'De drôles de marionnettes à gaine jouent une nouvelle histoire qui finit bien et apprennent aux petits à être attentifs, ouverts et toujours prêts à aider leurs proches.',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
    // TODO: publish when official poster/photo is available
    published: false,
  },
  {
    id: 'letuchiy', status: 'active',
    title: '«Летучий корабль»',
    titleFR: '«Le Vaisseau volant»',
    author: 'Сказочный мюзикл',
    authorFR: 'Comédie musicale féerique',
    tag: 'Мюзикл', age: '6+',
    palette: 'var(--ph-3)',
    description: 'Сказочный мюзикл для детей и взрослых.',
    descriptionFR: 'Une comédie musicale féerique pour les enfants et les adultes.',
    duration: 'Продолжительность уточняется', durationFR: 'Durée à confirmer',
    // TODO: publish when official poster/photo is available
    published: false,
  },
  {
    id: 'kovcheg', status: 'active',
    title: '«У ковчега в восемь»',
    titleFR: '«À l\'arche à huit heures»',
    author: 'Урлих Хуб',
    authorFR: 'Ulrich Hub',
    tag: 'Мюзикл', age: '6+',
    image: showImage('kovcheg8.webp'),
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
    image: showImage('nulin.webp'),
    imagePosition: 'center 30%',
    description: 'Лёгкая и остроумная поэма в театральном прочтении. Смешное и лирическое переплетаются так же легко, как строки Пушкина. Вечер для тех, кто любит слово.',
    descriptionFR: "Un poème léger et plein d'esprit. Le comique et le lyrique s'entrelacent comme les vers de Pouchkine. Une soirée pour ceux qui aiment les mots.",
    duration: '1 ч 10 мин (с антрактом)', durationFR: '1 h 10 min (avec entracte)',
  },
];

// Заготовки будущих показов. Сейчас вся осенняя афиша опубликована, поэтому
// массив пуст. Новые даты сначала добавляются сюда и в SEASON_CATALOG.
export const DRAFT_SHOWS: DraftShow[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Что показывать публично
//
// Спектакль с `published: false` остаётся в SHOWS и REPERTOIRE целиком — его
// id, дата, цены и тарифы нужны серверному каталогу, бронированию, проверке
// билетов, админке и старым броням. Он лишь не попадает в Афишу и Репертуар:
// официального постера ещё нет, а карточка с цветной подложкой вместо фото
// читается как забытый контент.
//
// ЧТОБЫ ОПУБЛИКОВАТЬ СПЕКТАКЛЬ, когда фотография придёт:
//   1. положить файл в public/images/shows/;
//   2. в этом файле дописать спектаклю `image: showImage('файл.webp')` —
//      и в SHOWS, и в его карточке в REPERTOIRE;
//   3. убрать оттуда же строки `published: false` и TODO над ними.
// Больше нигде ничего менять не нужно: секции читают списки ниже.
//
// SHOWS/REPERTOIRE напрямую берут только админка, deep-link и история
// посещений — им нужен весь каталог.
const isPublished = (item: { published?: boolean }) => item.published !== false;

export const PUBLISHED_SHOWS: Show[] = SHOWS.filter(isPublished);
export const PUBLISHED_REPERTOIRE: RepertoireItem[] = REPERTOIRE.filter(isPublished);
