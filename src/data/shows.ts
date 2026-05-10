import type { Show, RepertoireItem } from '../types';

export const SHOWS: Show[] = [
  {
    id: 'kolobok',
    title: '«Волшебный Секрет Колобка»',
    author: 'Artland · Сказка с музыкой',
    date: '17.05', day: '17', month: 'Май', time: '11:00', year: '2026',
    age: '0+', price: 'от 15 €', duration: '50 мин',
    desc:   'Говорят, Колобок однажды просто ушёл из дома. Мы решили уточнить детали — и оказалось, история куда интереснее. На сцене музыкант и волшебник.',
    descFR: 'On dit que Kolobok est simplement parti de chez lui un jour. Nous avons voulu en savoir plus — et l\'histoire s\'avère bien plus fascinante. Sur scène, un musicien et un magicien.',
    href: 'https://constellation.events/event/volsebnyi-sekret-kolobka',
    palette: 'linear-gradient(135deg, #6b1a1a 0%, #2a0608 60%, #1a0a08 100%)',
    glyph: '✦',
    image: '/images/shows/kolobok.jpg',
  },
  {
    id: 'shutka',
    title: '«И в шутку, и всерьёз»',
    author: 'А. П. Чехов · Две комедии',
    date: '22.05', day: '22', month: 'Май', time: '20:00', year: '2026',
    age: '12+', price: 'от 15 €', duration: '1 ч 10 мин',
    desc:   'Две одноактные комедии Чехова — «Юбилей» и «Предложение». О спорах, нервах, любви и о том, как смешно мы выглядим, когда серьёзны.',
    descFR: 'Deux comédies en un acte de Tchekhov — «L\'Anniversaire» et «La Demande en mariage». Sur les disputes, les nerfs, l\'amour et à quel point nous sommes comiques quand nous nous prenons au sérieux.',
    href: 'https://constellation.events/event/i-v-sutku-i-vserez-12-copy',
    palette: 'linear-gradient(135deg, #2a1014 0%, #1a0a08 50%, #0a0605 100%)',
    glyph: '❦',
    image: '/images/shows/shutka.jpg',
  },
  {
    id: 'nulin',
    title: '«Граф Нулин»',
    author: 'А. С. Пушкин · Поэма-комедия',
    date: '29.05', day: '29', month: 'Май', time: '20:00', year: '2026',
    age: '12+', price: 'от 30 €', duration: '1 ч 10 мин',
    desc:   'Лёгкая и остроумная поэма, где смешное и лирическое переплетаются так же легко, как строки Пушкина. Вечер для тех, кто любит слово.',
    descFR: 'Un poème léger et plein d\'esprit, où le comique et le lyrique s\'entrelacent aussi aisément que les vers de Pouchkine. Une soirée pour ceux qui aiment les mots.',
    href: 'https://constellation.events/event/graf-nulin-12',
    palette: 'linear-gradient(135deg, #401418 0%, #1a0608 60%, #0a0605 100%)',
    glyph: '❧',
    image: '/images/shows/nulin.jpg',
  },
];

export const REPERTOIRE: RepertoireItem[] = [
  { title: '«Граф Нулин»',             author: 'А. С. Пушкин',      tag: 'Поэма',    age: '12+', glyph: '❧', palette: 'linear-gradient(135deg, #401418 0%, #1a0608 100%)' },
  { title: '«И в шутку, и всерьёз»',   author: 'А. П. Чехов',       tag: 'Комедия',  age: '12+', glyph: '❦', palette: 'linear-gradient(135deg, #2a1014 0%, #1a0a08 100%)' },
  { title: '«Волшебный Секрет Колобка»', author: 'Artland',           tag: 'Сказка',   age: '0+',  glyph: '✦', palette: 'linear-gradient(135deg, #6b1a1a 0%, #2a0608 100%)' },
  { title: '«Чайка»',                  author: 'А. П. Чехов',       tag: 'Драма',    age: '16+', glyph: '✸', palette: 'linear-gradient(135deg, #1a1a2e 0%, #0a0a14 100%)' },
  { title: '«Маленькие трагедии»',     author: 'А. С. Пушкин',      tag: 'Цикл',     age: '14+', glyph: '✺', palette: 'linear-gradient(135deg, #2a0e0e 0%, #14060a 100%)' },
  { title: '«Дядя Ваня»',              author: 'А. П. Чехов',       tag: 'Драма',    age: '14+', glyph: '✻', palette: 'linear-gradient(135deg, #1c2014 0%, #0a0e08 100%)' },
  { title: '«Анна Каренина»',          author: 'Л. Н. Толстой',     tag: 'Спектакль',age: '16+', glyph: '❋', palette: 'linear-gradient(135deg, #3a1a1a 0%, #14080a 100%)' },
  { title: '«Бесприданница»',          author: 'А. Н. Островский',  tag: 'Драма',    age: '14+', glyph: '❃', palette: 'linear-gradient(135deg, #2a1a2a 0%, #14080e 100%)' },
];

