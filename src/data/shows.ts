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
    age: '12+', price: 'от 15 €', priceFR: 'à partir de 15 €', duration: '60 мин', durationFR: '60 min',
    desc:   'Литературно-музыкальный спектакль по мотивам биографии Марины Цветаевой — история о жизни, судьбе и творчестве одной из самых сильных и трагических фигур русской поэзии.',
    descFR: "Spectacle littéraire et musical inspiré de la biographie de Marina Tsvetaïeva — l'histoire de la vie, du destin et de l'œuvre de l'une des figures les plus marquantes et les plus tragiques de la poésie russe.",
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
      { id: 'standard', label: 'Стандарт', price: 15, available: 40 },
    ],
  },
  {
    id: 'shutka',
    title: '«И в шутку, и всерьёз»',
    titleFR: '«Sérieusement ou pas»',
    author: 'А. П. Чехов · Две комедии',
    authorFR: 'A. P. Tchekhov · Deux comédies',
    date: '02.10', day: '02', month: 'Окт', time: '20:00', year: '2026',
    age: '12+', price: 'от 15 €', priceFR: 'à partir de 15 €', duration: '1 ч 10 мин', durationFR: '1 h 10 min',
    desc:   'Две одноактные комедии Чехова — «Юбилей» и «Предложение». О спорах, нервах, любви и о том, как смешно мы выглядим, когда серьёзны.',
    descFR: 'Deux comédies en un acte de Tchekhov — «L\'Anniversaire» et «La Demande en mariage». Sur les disputes, les nerfs, l\'amour et à quel point nous sommes comiques quand nous nous prenons au sérieux.',
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
      { id: 'standard', label: 'Стандарт', price: 15, available: 38 },
      { id: 'student',  label: 'Студенческий', price: 10, available: 12 },
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
    tag: 'Поэзия', age: '12+',
    palette: 'var(--ph-1)',
    image: showImage('romantika.webp'),
    imagePosition: 'center 53%',
    description: 'Литературно-музыкальный спектакль по мотивам биографии Марины Цветаевой. История о жизни, судьбе и творчестве одной из самых трагических фигур русской поэзии.',
    descriptionFR: 'Spectacle littéraire et musical inspiré de la biographie de Marina Tsvetaïeva. L\'histoire de la vie, du destin et de l\'œuvre de l\'une des figures les plus tragiques de la poésie russe.',
    duration: '60 мин', durationFR: '60 min',
  },
  {
    id: 'shutka', status: 'active',
    title: '«И в шутку, и всерьёз»',
    titleFR: '«Sérieusement ou pas»',
    author: 'А. П. Чехов',
    authorFR: 'A. P. Tchekhov',
    tag: 'Комедия', age: '12+',
    palette: 'var(--ph-2)',
    image: showImage('shutka.webp'),
    description: 'Две одноактные комедии Чехова — «Юбилей» и «Предложение». О спорах, нервах, любви и о том, как смешно мы выглядим, когда серьёзны.',
    descriptionFR: 'Deux comédies en un acte de Tchekhov. Sur les disputes, les nerfs, l\'amour et notre comique involontaire.',
    duration: '1 ч 10 мин', durationFR: '1 h 10 min',
  },
  {
    id: 'lubov', status: 'active',
    title: '«Счастливая любовь»',
    titleFR: '«Un amour heureux»',
    author: 'А. Аверченко и Н. Тэффи',
    authorFR: 'A. Averchenko et N. Teffi',
    tag: 'Комедия', age: '0+',
    palette: 'var(--ph-1)',
    image: showImage('lubov.webp'),
    description: 'По рассказам А.Аверченко и Н. Тэффи. Пять новелл о любви',
    descriptionFR: "D'après les récits d'A. Averchenko et de N. Teffi. Cinq nouvelles sur l'amour",
    duration: '90 мин', durationFR: '90 min',
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

// Заготовки осенней афиши 2026 — спектакли, у которых уже есть дата, но ещё
// нет постера, фотографий, описания и цен. Они намеренно НЕ рендерятся: ни в
// Афише, ни в Репертуаре, ни в админке. Массив существует ради одного —
// дата хранится в коде рядом с остальным расписанием и совпадает с
// DRAFT_SHOWS серверного каталога (сверяется tests/unit/pastShows.test.ts).
//
// Чтобы опубликовать спектакль: добавить материалы в public/images/shows,
// перенести запись в SHOWS с ticketTypes и описанием, завести карточку в
// REPERTOIRE и поднять published в true в shared/catalog/shows.ts.
export const DRAFT_SHOWS: DraftShow[] = [
  {
    id: 'korablik',
    title: '«Приключения кораблика»',
    titleFR: '«Les Aventures du petit bateau»',
    subtitle: 'Кукольный спектакль',
    subtitleFR: 'Spectacle de marionnettes',
    day: '04', month: 'Окт', time: '10:00', year: '2026',
    published: false,
  },
  {
    id: 'razgovor',
    title: '«Разговор, которого не было»',
    titleFR: '«La conversation qui n\'a pas eu lieu»',
    subtitle: 'Трагикомедия',
    subtitleFR: 'Tragicomédie',
    day: '16', month: 'Окт', time: '20:00', year: '2026',
    published: false,
  },
  {
    id: 'enot',
    title: '«Крошка Енот»',
    titleFR: '«Le Petit Raton laveur»',
    subtitle: 'Кукольный спектакль',
    subtitleFR: 'Spectacle de marionnettes',
    day: '18', month: 'Окт', time: '10:00', year: '2026',
    published: false,
  },
  {
    // Постановка уже есть в REPERTOIRE (фото и описание на месте) —
    // не хватает только цен, поэтому в Афишу она пока не выходит.
    id: 'lubov',
    title: '«Счастливая любовь»',
    titleFR: '«Un amour heureux»',
    subtitle: 'А. Аверченко и Н. Тэффи · Пять новелл о любви',
    subtitleFR: 'A. Averchenko et N. Teffi · Cinq nouvelles sur l\'amour',
    day: '14', month: 'Ноя', time: '19:00', year: '2026',
    published: false,
  },
  {
    id: 'shapochka',
    title: '«Красная Шапочка»',
    titleFR: '«Le Petit Chaperon rouge»',
    subtitle: 'Кукольный спектакль',
    subtitleFR: 'Spectacle de marionnettes',
    day: '15', month: 'Ноя', time: '10:00', year: '2026',
    published: false,
  },
  {
    id: 'letuchiy',
    title: '«Летучий корабль»',
    titleFR: '«Le Vaisseau volant»',
    subtitle: 'Музыкальный спектакль',
    subtitleFR: 'Spectacle musical',
    day: '22', month: 'Ноя', time: '19:00', year: '2026',
    published: false,
  },
  {
    id: 'kovcheg',
    title: '«У ковчега в восемь»',
    titleFR: '«À l\'arche à huit heures»',
    subtitle: 'У. Хуб · Музыкальный спектакль',
    subtitleFR: 'U. Hub · Spectacle musical',
    day: '28', month: 'Ноя', time: '19:00', year: '2026',
    published: false,
  },
];
