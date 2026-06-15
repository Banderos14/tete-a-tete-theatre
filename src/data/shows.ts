import type { Show, RepertoireItem } from '../types';

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
    date: '14.06', day: '14', month: 'Июн', time: '19:00', year: '2026',
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
    totalSeats: 100,
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
    date: '28.06', day: '28', month: 'Июн', time: '20:00', year: '2026',
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
    totalSeats: 100,
    ticketTypes: [
      { id: 'standard', label: 'Стандарт', price: 15, available: 38 },
      { id: 'student',  label: 'Студенческий', price: 10, available: 12 },
    ],
  },
  {
    id: 'nulin',
    title: '«Граф Нулин»',
    titleFR: '«Le Comte Nouline»',
    author: 'А. С. Пушкин · Поэма-комедия',
    authorFR: 'A. S. Pouchkine · Poème-comédie',
    date: '12.07', day: '12', month: 'Июл', time: '20:00', year: '2026',
    age: '12+', price: 'от 30 €', priceFR: 'à partir de 30 €', duration: '1 ч 10 мин (с антрактом)', durationFR: '1 h 10 min (avec entracte)',
    desc:   'Остроумная и изящная поэма, где смешное и лирическое переплетаются так же легко, как строки А. С. Пушкина. История о случайной встрече, нарушившей привычный порядок провинциальной усадьбы. Молодой граф Нулин оказывается в доме Натальи Павловны в отсутствие её супруга — и обычный вечер превращается в тонкую игру характеров, взглядов и намерений. На сцене оживает атмосфера русской усадьбы XIX века: светские манеры, игра характеров и лёгкость поэтического слова.',
    descFR: "Un poème plein d'esprit et d'élégance, où le comique et le lyrique s'entremêlent avec autant de légèreté que les vers d'A. S. Pouchkine. L'histoire d'une rencontre fortuite qui a bouleversé l'ordre habituel d'un domaine provincial. Le jeune comte Nouline se retrouve chez Natalia Pavlovna en l'absence de son époux — et une soirée ordinaire se transforme en un jeu subtil de caractères, de regards et d'intentions. L'atmosphère d'un manoir russe du XIXe siècle prend vie sur scène : manières mondaines, jeu des caractères et légèreté de la parole poétique.",
    palette: 'var(--ph-1)',
    image: showImage('nulin.webp'),
    photos: [
      { src: showPhoto('nulin1.webp'), position: 'center 30%', mobileScale: 1},
      { src: showPhoto('nulin2.webp'), position: 'center 40%', mobileScale: 1},
      { src: showPhoto('nulin3.webp'), position: 'center 35%', mobileScale: 1},
      { src: showPhoto('nulin4.webp'), position: 'center 40%', mobileScale: 1},
      { src: showPhoto('nulin5.webp'), position: 'center 40%', mobileScale: 1},
    ],
    totalSeats: 100,
    ticketTypes: [
      { id: 'standard', label: 'Стандарт', price: 30, available: 45 },
      { id: 'student',  label: 'Студенческий', price: 20, available: 10 },
    ],
  },
];

export const REPERTOIRE: RepertoireItem[] = [
  // ── Активные — есть в SHOWS, отображаются с датой и кнопкой «Купить билет» ──
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
    id: 'nulin', status: 'active',
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

  // ── Прошедшие — нет в SHOWS, кнопки «Купить билет» не будет ── status: 'past'
  {
    id: 'lubov', status: 'past',
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
];
