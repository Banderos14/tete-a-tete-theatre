export type Lang = 'RU' | 'FR';

export interface Stat {
  num: string;
  suffix: string;
  label: string;
  italic: boolean;
}

export interface T {
  curtain: {
    sub: string;
  };
  nav: {
    afisha: string;
    repertoire: string;
    about: string;
    people: string;
    partners: string;
  };
  hero: {
    eyebrow: string;
    sub: string;
    ctaAfisha: string;
    ctaRep: string;
    ctaInstagram: string;
    metaYear: string;
    scroll: string;
  };
  marquee: string[];
  afisha: {
    num: string;
    title: string;
    titleIt: string;
    meta: string;
    book: string;
  };
  socials: {
    num: string;
    title: string;
    titleIt: string;
    h3: string;
    h3It: string;
    h3After: string;
    text: string;
  };
  about: {
    num: string;
    title: string;
    titleIt: string;
    meta: string;
    quote: string;
    quoteAttr: string;
    p1: string;
    p2: string;
    stats: Stat[];
  };
  repertoire: {
    num: string;
    title: string;
    titleIt: string;
    metaShows: (n: number) => string;
    metaSeason: string;
    more: string;
  };
  team: {
    num: string;
    title: string;
    titleIt: string;
    metaLine1: string;
    metaLine2: string;
    roles: Record<string, string>;
  };
  partners: {
    num: string;
    title: string;
    titleIt: string;
    metaLine1: string;
    metaLine2: string;
  };
  contacts: {
    num: string;
    title: string;
    titleIt: string;
    metaLine1: string;
    metaLine2: string;
    labelAddress: string;
    labelEmail: string;
    labelPhone: string;
    labelHours: string;
    hoursWeekdays: string;
    hoursSunday: string;
    addressHint: string;
    btnMaps: string;
    mapAddr: string;
    mapLink: string;
  };
  footer: {
    copyright: string;
    backTop: string;
  };
  showTags: Record<string, string>;
  months: Record<string, string>;
}

export const translations: Record<Lang, T> = {
  RU: {
    curtain: {
      sub: 'Русский театр · Nice',
    },
    nav: {
      afisha:     'Афиша',
      repertoire: 'Репертуар',
      about:      'О театре',
      people:     'Люди',
      partners:   'Партнёры',
    },
    hero: {
      eyebrow:     'Сезон 2025 / 2026 · Nice, Côte d\'Azur',
      sub:         'Русский театр в Ницце',
      ctaAfisha:   'Смотреть афишу',
      ctaRep:      'Репертуар',
      ctaInstagram:'Instagram',
      metaYear:    'с 2018',
      scroll:      'Войти в зал',
    },
    marquee: [
      'Премьера 22.05', 'Чехов · И в шутку и всерьёз',
      '29.05 · Граф Нулин', 'Сезон 2025/2026',
      'Бронирование открыто', 'Nice · Rue Rossini',
    ],
    afisha: {
      num:     '01 / Афиша',
      title:   'Ближайшие',
      titleIt: 'премьеры',
      meta:    'Май — Июнь\n2026',
      book:    'Забронировать',
    },
    socials: {
      num:     '02 / Live',
      title:   'Закулисье',
      titleIt: 'нашего театра',
      h3:      'Живая',
      h3It:    'хроника',
      h3After: 'сцены',
      text:    'Наш Instagram — живая афиша театра: репетиции, премьеры, закулисье и новости. Следите за тем, как рождается спектакль — от первой читки до выхода на сцену.',
    },
    about: {
      num:       '03 / About',
      title:     'О',
      titleIt:   'театре',
      meta:      'Основан в 2018\nNICE · FRANCE',
      quote:     'Театр — это не место. Это разговор. Очень тихий, очень близкий — лицом к лицу.',
      quoteAttr: '— Из манифеста театра, 2018',
      p1: 'ТЕТ-А-ТЕТ — независимый русский театр в Ницце, основанный в 2018 году. Камерная сцена в самом сердце города, где каждый спектакль — встреча с автором на расстоянии вытянутой руки.',
      p2: 'Мы играем русскую и европейскую классику, современную драматургию, ставим спектакли для детей. Мы не музей и не реконструкция — мы живой театр, говорящий с сегодняшним зрителем на двух языках.',
      stats: [
        { num: '7',    suffix: ' лет', label: 'на сцене',      italic: true  },
        { num: '42',   suffix: '',     label: 'постановки',    italic: false },
        { num: '1635', suffix: '',     label: 'зрителей · сезон', italic: false },
      ],
    },
    repertoire: {
      num:        '04 / Репертуар',
      title:      'Постоянная',
      titleIt:    'сцена',
      metaShows:  (n) => `${n} спектаклей`,
      metaSeason: 'сезон 2025/26',
      more:       'Подробнее',
    },
    team: {
      num:      '05 / Труппа',
      title:    'Люди',
      titleIt:  'театра',
      metaLine1:'Актёры · Режиссёры',
      metaLine2:'Постановочная группа',
      roles: {
        'Художественный руководитель': 'Художественный руководитель',
        'Режиссёр-постановщик':        'Режиссёр-постановщик',
        'Актриса':                     'Актриса',
        'Актёр':                       'Актёр',
        'Актёр · Музыкант':            'Актёр · Музыкант',
        'Художник по свету':           'Художник по свету',
        'Звукорежиссёр':               'Звукорежиссёр',
      },
    },
    partners: {
      num:      '06 / Партнёры',
      title:    'Кто',
      titleIt:  'с нами',
      metaLine1:'Организации · Медиа',
      metaLine2:'Институции',
    },
    contacts: {
      num:          '07 / Контакты',
      title:        'Найти',
      titleIt:      'театр',
      metaLine1:    'ПТ–СБ · 14:00–19:00',
      metaLine2:    'NICE',
      labelAddress: 'Адрес',
      labelEmail:   'Email',
      labelPhone:   'Телефон',
      labelHours:   'Расписание кассы',
      hoursWeekdays:'Пт – Сб · 14:00 – 19:00',
      hoursSunday:  'Вс · за час до спектакля',
      addressHint:  '5 минут от Place Masséna',
      btnMaps:      'Открыть в Google Maps',
      mapAddr:      '24 RUE ROSSINI · 06000 NICE',
      mapLink:      'Открыть карту',
    },
    footer: {
      copyright: '© 2026 ТЕТ-А-ТЕТ · Русский театр в Ницце',
      backTop:   'Наверх',
    },
    showTags: {
      'Поэма':    'Поэма',
      'Комедия':  'Комедия',
      'Сказка':   'Сказка',
      'Драма':    'Драма',
      'Цикл':     'Цикл',
      'Спектакль':'Спектакль',
    },
    months: {
      'Май': 'Май',
      'Июн': 'Июн',
      'Июл': 'Июл',
    },
  },

  FR: {
    curtain: {
      sub: 'Théâtre russe · Nice',
    },
    nav: {
      afisha:     'Affiche',
      repertoire: 'Répertoire',
      about:      'À propos',
      people:     'Équipe',
      partners:   'Partenaires',
    },
    hero: {
      eyebrow:     'Saison 2025 / 2026 · Nice, Côte d\'Azur',
      sub:         'Théâtre russe à Nice',
      ctaAfisha:   'Voir l\'affiche',
      ctaRep:      'Répertoire',
      ctaInstagram:'Instagram',
      metaYear:    'depuis 2018',
      scroll:      'Entrer dans la salle',
    },
    marquee: [
      'Première 22.05', 'Tchekhov · Sérieusement ou pas',
      '29.05 · Le Comte Nouline', 'Saison 2025/2026',
      'Réservations ouvertes', 'Nice · Rue Rossini',
    ],
    afisha: {
      num:     '01 / Affiche',
      title:   'Prochaines',
      titleIt: 'premières',
      meta:    'Mai — Juin\n2026',
      book:    'Réserver',
    },
    socials: {
      num:     '02 / Live',
      title:   'Les coulisses',
      titleIt: 'de notre théâtre',
      h3:      'La chronique',
      h3It:    'vivante',
      h3After: 'de la scène',
      text:    'Notre Instagram — la chronique vivante du théâtre : répétitions, premières, coulisses et actualités. Suivez la naissance d\'un spectacle — de la première lecture à la représentation.',
    },
    about: {
      num:       '03 / About',
      title:     'À propos',
      titleIt:   'du théâtre',
      meta:      'Fondé en 2018\nNICE · FRANCE',
      quote:     'Le théâtre n\'est pas un lieu. C\'est une conversation. Très silencieuse, très intime — face à face.',
      quoteAttr: '— Du manifeste du théâtre, 2018',
      p1: 'TÊT-À-TÊT est un théâtre russe indépendant à Nice, fondé en 2018. Une scène intime au cœur de la ville, où chaque spectacle est une rencontre avec l\'auteur à portée de main.',
      p2: 'Nous jouons les classiques russes et européens, la dramaturgie contemporaine, et proposons des spectacles pour enfants. Nous ne sommes pas un musée — nous sommes un théâtre vivant qui parle au public d\'aujourd\'hui en deux langues.',
      stats: [
        { num: '7',    suffix: ' ans', label: 'sur scène',             italic: true  },
        { num: '42',   suffix: '',     label: 'spectacles',            italic: false },
        { num: '1635', suffix: '',     label: 'spectateurs · saison',  italic: false },
      ],
    },
    repertoire: {
      num:        '04 / Répertoire',
      title:      'La scène',
      titleIt:    'permanente',
      metaShows:  (n) => `${n} spectacles`,
      metaSeason: 'saison 2025/26',
      more:       'En savoir plus',
    },
    team: {
      num:      '05 / Troupe',
      title:    'L\'équipe',
      titleIt:  'du théâtre',
      metaLine1:'Acteurs · Metteurs en scène',
      metaLine2:'Équipe de production',
      roles: {
        'Художественный руководитель': 'Directeur artistique',
        'Режиссёр-постановщик':        'Metteur en scène',
        'Актриса':                     'Actrice',
        'Актёр':                       'Acteur',
        'Актёр · Музыкант':            'Acteur · Musicien',
        'Художник по свету':           'Créateur lumière',
        'Звукорежиссёр':               'Ingénieur du son',
      },
    },
    partners: {
      num:      '06 / Partenaires',
      title:    'Avec',
      titleIt:  'nous',
      metaLine1:'Organisations · Médias',
      metaLine2:'Institutions',
    },
    contacts: {
      num:          '07 / Contacts',
      title:        'Trouver',
      titleIt:      'le théâtre',
      metaLine1:    'VE–SA · 14:00–19:00',
      metaLine2:    'NICE',
      labelAddress: 'Adresse',
      labelEmail:   'E-mail',
      labelPhone:   'Téléphone',
      labelHours:   'Horaires de la billetterie',
      hoursWeekdays:'Ve – Sa · 14:00 – 19:00',
      hoursSunday:  'Dim · une heure avant le spectacle',
      addressHint:  '5 minutes de la Place Masséna',
      btnMaps:      'Ouvrir dans Google Maps',
      mapAddr:      '24 RUE ROSSINI · 06000 NICE',
      mapLink:      'Ouvrir la carte',
    },
    footer: {
      copyright: '© 2026 TÊT-À-TÊT · Théâtre russe à Nice',
      backTop:   'Haut de page',
    },
    showTags: {
      'Поэма':    'Poème',
      'Комедия':  'Comédie',
      'Сказка':   'Conte',
      'Драма':    'Drame',
      'Цикл':     'Cycle',
      'Спектакль':'Spectacle',
    },
    months: {
      'Май': 'Mai',
      'Июн': 'Juin',
      'Июл': 'Juillet',
    },
  },
};
