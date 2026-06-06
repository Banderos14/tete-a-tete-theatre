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
  auth: {
    headerBtn: string;
    signIn: string;
    signUp: string;
    googleBtn: string;
    emailLabel: string;
    passwordLabel: string;
    nameLabel: string;
    forgotPassword: string;
    orDivider: string;
    noAccount: string;
    hasAccount: string;
    register: string;
    resetSent: string;
    errors: {
      invalidEmail: string;
      wrongPassword: string;
      emailInUse: string;
      weakPassword: string;
      userNotFound: string;
      tooManyRequests: string;
      popupBlocked: string;
      popupClosed: string;
      unauthorizedDomain: string;
      accountExistsDifferentCredential: string;
      operationNotAllowed: string;
      networkError: string;
      generic: string;
    };
  };
  profile: {
    title: string;
    sectionPersonal: string;
    sectionContacts: string;
    sectionSocials: string;
    sectionNotifications: string;
    displayName: string;
    birthday: string;
    phone: string;
    messengerLabel: string;
    messengerWhatsapp: string;
    messengerTelegram: string;
    phoneVerify: string;
    phoneEnterCode: string;
    phoneVerifyConfirm: string;
    phoneVerified: string;
    socialLink: string;
    socialLinkPlaceholder: string;
    connectFacebook: string;
    facebookConnected: string;
    notifyShows: string;
    notifyBirthday: string;
    save: string;
    saved: string;
    unsavedWarning: string;
    history: string;
    noHistory: string;
    notifications: string;
    logout: string;
    required: string;
    incomplete: (n: number) => string;
    visitCount: (n: number) => string;
    bonusProgress: (remaining: number) => string;
    bonusComplete: string;
    ticketCode: string;
    statusPending: string;
    statusConfirmed: string;
    statusCancelled: string;
    statusAttended: string;
    payStatusNotPaid: string;
    payStatusPaid: string;
    payStatusAwaiting: string;
  };
  booking: {
    title: string;
    loginRequired: string;
    loginBtn: string;
    ticketType: string;
    seatsLeft: string;
    tickets: string;
    paymentMethod: string;
    payOnSite: string;
    payOnSiteDesc: string;
    payTransfer: string;
    payTransferDesc: string;
    comment: string;
    commentPlaceholder: string;
    submit: string;
    submitError: string;
    successTitle: string;
    successText: string;
    successOnSite: string;
    successTransfer: string;
    successEmailHint: string;
    successAmount: string;
    transferDetailsLabel: string;
    transferRef: string;
    close: string;
    total: string;
    phone: string;
    labelShow: string;
    labelDate: string;
    labelTickets: string;
    labelAmount: string;
  };
  admin: {
    title: string;
    accessDenied: string;
    allShows: string;
    bookings: string;
    totalTickets: string;
    totalRevenue: string;
    noBookings: string;
    name: string;
    email: string;
    phone: string;
    tickets: string;
    ticketType: string;
    ticketStandard: string;
    ticketStudent: string;
    amount: string;
    date: string;
    payment: string;
    paymentStatus: string;
    status: string;
    comment: string;
    statusConfirmed: string;
    statusCancelled: string;
    statusPending: string;
    statusAttended: string;
    payOnSite: string;
    payTransfer: string;
    backToSite: string;
    filterAll: string;
    markConfirmed: string;
    markCancelled: string;
    markAttended: string;
    bookingsTab: string;
    usersTab: string;
    usersCount: string;
    userCreatedAt: string;
    noUsers: string;
    filterByStatus: string;
  };
  nav: {
    afisha: string;
    repertoire: string;
    about: string;
    people: string;
  };
  hero: {
    eyebrow: string;
    title: { before: string; letter: string; after: string };
    sub: { accent: string; rest: string };
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
    tileLabels: string[];
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
    imageLabels: string[];
  };
  repertoire: {
    num: string;
    title: string;
    titleIt: string;
    metaShows: (n: number) => string;
    metaSeason: string;
    more: string;
    statusActive: string;
    statusPast: string;
  };
  team: {
    num: string;
    title: string;
    titleIt: string;
    metaLine1: string;
    metaLine2: string;
    roles: Record<string, string>;
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
  showModal: {
    labelDate: string;
    labelTime: string;
    labelDuration: string;
    labelPrice: string;
    book: string;
  };
  showTags: Record<string, string>;
  months: Record<string, string>;
}

export const translations: Record<Lang, T> = {
  RU: {
    curtain: {
      sub: 'Русскоязычный театр · Nice',
    },
    nav: {
      afisha:     'Афиша',
      repertoire: 'Репертуар',
      about:      'О театре',
      people:     'Люди',
    },
    hero: {
      eyebrow:     'Сезон 2025 / 2026 · Nice, France',
      title:       { before: 'тет', letter: 'а', after: 'тет' },
      sub:         { accent: 'Русскоязычный', rest: 'театр' },
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
      tileLabels: ['Премьера', 'Закулисье', 'Репетиция', 'Поклон', 'Сцена'],
    },
    about: {
      num:       '03 / About',
      title:     'О',
      titleIt:   'театре',
      meta:      'Основан в 2018\nNICE · FRANCE',
      quote:     'Театр — это не место. Это разговор. Очень тихий, очень близкий — лицом к лицу.',
      quoteAttr: '— Из манифеста театра, 2018',
      p1: 'ТЕТ-А-ТЕТ — независимый русскоязычный театр в Ницце, основанный в 2018 году. Камерная сцена в самом сердце города, где каждый спектакль — встреча с автором на расстоянии вытянутой руки.',
      p2: 'Мы играем русскую и европейскую классику, современную драматургию, ставим спектакли для детей. Мы не музей и не реконструкция — мы живой театр, говорящий с сегодняшним зрителем на двух языках.',
      stats: [
        { num: '7',    suffix: ' лет', label: 'на сцене',      italic: true  },
        { num: '42',   suffix: '',     label: 'постановки',    italic: false },
        { num: '1635', suffix: '',     label: 'зрителей · сезон', italic: false },
      ],
      imageLabels: ['Сцена · 2025', 'Зрительный зал', 'Репетиция', 'Поклон труппы'],
    },
    repertoire: {
      num:          '04 / Репертуар',
      title:        'Постоянная',
      titleIt:      'сцена',
      metaShows:    (n) => `${n} спектаклей`,
      metaSeason:   'сезон 2025/26',
      more:         'Подробнее',
      statusActive: 'В репертуаре',
      statusPast:   'Прошедший',
    },
    team: {
      num:      '05 / Труппа',
      title:    'Люди',
      titleIt:  'театра',
      metaLine1:'Режиссёры · Актёры',
      metaLine2:'Молодёжный театр',
      roles: {},
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
      copyright: '© 2026 ТЕТ-А-ТЕТ · Русскоязычный театр в Ницце',
      backTop:   'Наверх',
    },
    auth: {
      headerBtn:       'Войти',
      signIn:          'Вход',
      signUp:          'Регистрация',
      googleBtn:       'Продолжить через Google',
      emailLabel:      'Email',
      passwordLabel:   'Пароль',
      nameLabel:       'Ваше имя',
      forgotPassword:  'Забыли пароль?',
      orDivider:       'или',
      noAccount:       'Нет аккаунта?',
      hasAccount:      'Уже есть аккаунт?',
      register:        'Зарегистрироваться',
      resetSent:       'Ссылка для сброса пароля отправлена на почту',
      errors: {
        invalidEmail:                     'Неверный формат email',
        wrongPassword:                    'Неверный пароль',
        emailInUse:                       'Этот email уже зарегистрирован. Попробуйте войти.',
        weakPassword:                     'Пароль должен содержать минимум 6 символов',
        userNotFound:                     'Пользователь с таким email не найден',
        tooManyRequests:                  'Слишком много попыток — попробуйте позже',
        popupBlocked:                     'Браузер заблокировал окно Google. Разрешите всплывающие окна и попробуйте снова.',
        popupClosed:                      'Вход через Google был отменён.',
        unauthorizedDomain:               'Этот домен не авторизован в Firebase. Обратитесь к администратору.',
        accountExistsDifferentCredential: 'Аккаунт с этим email уже существует через другой способ входа. Попробуйте войти через email.',
        operationNotAllowed:              'Этот способ входа не включён в настройках Firebase.',
        networkError:                     'Ошибка сети. Проверьте интернет-соединение.',
        generic:                          'Произошла ошибка, попробуйте снова',
      },
    },
    profile: {
      title:                 'Мой кабинет',
      sectionPersonal:       'Личные данные',
      sectionContacts:       'Контакты',
      sectionSocials:        'Социальные сети',
      sectionNotifications:  'Уведомления',
      displayName:           'Имя',
      birthday:              'Дата рождения',
      phone:                 'Телефон',
      messengerLabel:        'Связь через',
      messengerWhatsapp:     'WhatsApp',
      messengerTelegram:     'Telegram',
      phoneVerify:           'Подтвердить',
      phoneEnterCode:        'Код из SMS',
      phoneVerifyConfirm:    'Подтвердить код',
      phoneVerified:         '✓ Подтверждён',
      socialLink:            'Или вставьте ссылку',
      socialLinkPlaceholder: 'https://instagram.com/...',
      connectFacebook:       'Подключить Facebook',
      facebookConnected:     '✓ Facebook подключён',
      notifyShows:           'Новые спектакли и акции',
      notifyBirthday:        'Поздравление с днём рождения',
      save:                  'Сохранить',
      saved:                 'Сохранено',
      unsavedWarning:        'Сохраните изменения',
      history:               'Мои билеты',
      noHistory:             'Билетов пока нет',
      notifications:         'Уведомления о новых спектаклях',
      logout:                'Выйти',
      required:              'Обязательное поле',
      incomplete:            (n) => `Заполните профиль — осталось ${n} ${n === 1 ? 'поле' : 'поля'}`,
      visitCount:            (n) => n === 0 ? 'Вы ещё не посетили ни одного спектакля' : `Вы посетили ${n} ${n === 1 ? 'спектакль' : n < 5 ? 'спектакля' : 'спектаклей'}`,
      bonusProgress:         (r) => `До подарка осталось ${r} ${r === 1 ? 'посещение' : r < 5 ? 'посещения' : 'посещений'}`,
      bonusComplete:         '🎁 Вы получаете подарок на следующий спектакль!',
      ticketCode:            'Код брони',
      statusPending:         'Ожидает подтверждения',
      statusConfirmed:       'Подтверждено',
      statusCancelled:       'Отменено',
      statusAttended:        'Посещено',
      payStatusNotPaid:      'Не оплачено',
      payStatusPaid:         'Оплачено',
      payStatusAwaiting:     'Ожидает перевода',
    },
    booking: {
      title:               'Бронирование',
      loginRequired:       'Чтобы забронировать билет, войдите в аккаунт',
      loginBtn:            'Войти или зарегистрироваться',
      ticketType:          'Тип билета',
      seatsLeft:           'Осталось мест',
      tickets:             'Количество билетов',
      paymentMethod:       'Способ оплаты',
      payOnSite:           'Оплата на месте',
      payOnSiteDesc:       'Оплатите наличными в кассе театра',
      payTransfer:         'Банковский перевод',
      payTransferDesc:     'Реквизиты придут после бронирования',
      comment:             'Комментарий',
      commentPlaceholder:  'Особые пожелания, вопросы...',
      submit:              'Подтвердить бронирование',
      submitError:         'Не удалось сохранить бронирование. Попробуйте ещё раз.',
      successTitle:        'Бронирование принято',
      successText:         'Детали будут отправлены на ваш e-mail.',
      successOnSite:       'Ваше бронирование принято. Детали придут на ваш e-mail. Оплата — на месте, перед спектаклем.',
      successTransfer:     'Ваше бронирование принято. Переведите указанную сумму по реквизитам ниже. Детали придут на ваш e-mail.',
      successEmailHint:    'Детали отправлены на:',
      successAmount:       'Сумма к оплате',
      transferDetailsLabel:'Реквизиты для перевода',
      transferRef:         'Назначение платежа',
      close:               'Закрыть',
      total:               'Итого',
      phone:               'Контактный телефон',
      labelShow:           'Спектакль',
      labelDate:           'Дата',
      labelTickets:        'Билеты',
      labelAmount:         'Сумма',
    },
    admin: {
      title:           'Панель администратора',
      accessDenied:    'Доступ запрещён',
      allShows:        'Все спектакли',
      bookings:        'бронирований',
      totalTickets:    'билетов',
      totalRevenue:    'оплачено',
      noBookings:      'Бронирований пока нет',
      name:            'Имя',
      email:           'Email',
      phone:           'Телефон',
      tickets:         'Билеты',
      ticketType:      'Тип',
      ticketStandard:  'Стандарт',
      ticketStudent:   'Студент',
      amount:          'Сумма',
      date:            'Дата брони',
      payment:         'Оплата',
      paymentStatus:   'Статус оплаты',
      status:          'Статус брони',
      comment:         'Комментарий',
      statusConfirmed: 'Подтверждено',
      statusCancelled: 'Отменено',
      statusPending:   'Ожидает',
      statusAttended:  'Посещено',
      payOnSite:       'На месте',
      payTransfer:     'Перевод',
      backToSite:      '← На сайт',
      filterAll:       'Все спектакли',
      markConfirmed:   'Подтвердить',
      markCancelled:   'Отменить',
      markAttended:    'Посещение',
      bookingsTab:     'Бронирования',
      usersTab:        'Зрители',
      usersCount:      'зрителей',
      userCreatedAt:   'Дата регистрации',
      noUsers:         'Зрителей пока нет',
      filterByStatus:  'Статус:',
    },
    showModal: {
      labelDate:     'Дата',
      labelTime:     'Начало',
      labelDuration: 'Длительность',
      labelPrice:    'Стоимость',
      book:          'Купить билет',
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
      sub: 'Théâtre russophone · Nice',
    },
    nav: {
      afisha:     'Affiche',
      repertoire: 'Répertoire',
      about:      'À propos',
      people:     'Équipe',
    },
    hero: {
      eyebrow:     'Saison 2025 / 2026 · Nice, Côte d\'Azur',
      title:       { before: 'tête', letter: 'à', after: 'tête' },
      sub:         { accent: 'Théâtre', rest: 'russophone' },
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
      tileLabels: ['Première', 'Coulisses', 'Répétition', 'Salut', 'Scène'],
    },
    about: {
      num:       '03 / About',
      title:     'À propos',
      titleIt:   'du théâtre',
      meta:      'Fondé en 2018\nNICE · FRANCE',
      quote:     'Le théâtre n\'est pas un lieu. C\'est une conversation. Très silencieuse, très intime — face à face.',
      quoteAttr: '— Du manifeste du théâtre, 2018',
      p1: 'TÊT-À-TÊT est un théâtre russophone indépendant à Nice, fondé en 2018. Une scène intime au cœur de la ville, où chaque spectacle est une rencontre avec l\'auteur à portée de main.',
      p2: 'Nous jouons les classiques russes et européens, la dramaturgie contemporaine, et proposons des spectacles pour enfants. Nous ne sommes pas un musée — nous sommes un théâtre vivant qui parle au public d\'aujourd\'hui en deux langues.',
      stats: [
        { num: '7',    suffix: ' ans', label: 'sur scène',             italic: true  },
        { num: '42',   suffix: '',     label: 'spectacles',            italic: false },
        { num: '1635', suffix: '',     label: 'spectateurs · saison',  italic: false },
      ],
      imageLabels: ['Scène · 2025', 'Salle', 'Répétition', 'Salut de la troupe'],
    },
    repertoire: {
      num:          '04 / Répertoire',
      title:        'La scène',
      titleIt:      'permanente',
      metaShows:    (n) => `${n} spectacles`,
      metaSeason:   'saison 2025/26',
      more:         'En savoir plus',
      statusActive: 'Au répertoire',
      statusPast:   'Passé',
    },
    team: {
      num:      '05 / Troupe',
      title:    'L\'équipe',
      titleIt:  'du théâtre',
      metaLine1:'Metteurs en scène · Acteurs',
      metaLine2:'Théâtre jeunesse',
      roles: {
        'Актриса · режиссёр · педагог по мастерству актёра': 'Actrice · metteure en scène · prof. de jeu',
        'Актёр · режиссёр · педагог по мастерству актёра':  'Acteur · metteur en scène · prof. de jeu',
        'Актриса · режиссёр · педагог по сценической речи': 'Actrice · metteure en scène · prof. de diction',
        'Актёр · режиссёр · педагог по вокалу':             'Acteur · metteur en scène · prof. de chant',
        'Актриса · педагог по вокалу':                      'Actrice · professeure de chant',
        'Актриса':                                           'Actrice',
        'Актёр · музыкант':                                  'Acteur · musicien',
        'Актёр':                                             'Acteur',
      },
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
      copyright: '© 2026 TÊT-À-TÊT · Théâtre russophone à Nice',
      backTop:   'Haut de page',
    },
    auth: {
      headerBtn:       'Connexion',
      signIn:          'Connexion',
      signUp:          'Inscription',
      googleBtn:       'Continuer avec Google',
      emailLabel:      'E-mail',
      passwordLabel:   'Mot de passe',
      nameLabel:       'Votre prénom',
      forgotPassword:  'Mot de passe oublié ?',
      orDivider:       'ou',
      noAccount:       'Pas encore de compte ?',
      hasAccount:      'Déjà un compte ?',
      register:        "S'inscrire",
      resetSent:       'Un lien de réinitialisation a été envoyé à votre e-mail',
      errors: {
        invalidEmail:                     'Format d\'e-mail invalide',
        wrongPassword:                    'Mot de passe incorrect',
        emailInUse:                       'Cet e-mail est déjà utilisé. Essayez de vous connecter.',
        weakPassword:                     'Le mot de passe doit contenir au moins 6 caractères',
        userNotFound:                     'Aucun compte trouvé pour cet e-mail',
        tooManyRequests:                  'Trop de tentatives — réessayez plus tard',
        popupBlocked:                     'Le navigateur a bloqué la fenêtre Google. Autorisez les fenêtres contextuelles et réessayez.',
        popupClosed:                      'La connexion Google a été annulée.',
        unauthorizedDomain:               'Ce domaine n\'est pas autorisé dans Firebase. Contactez l\'administrateur.',
        accountExistsDifferentCredential: 'Un compte existe déjà avec cet e-mail via une autre méthode. Essayez la connexion par e-mail.',
        operationNotAllowed:              'Cette méthode de connexion n\'est pas activée dans Firebase.',
        networkError:                     'Erreur réseau. Vérifiez votre connexion internet.',
        generic:                          'Une erreur est survenue, veuillez réessayer',
      },
    },
    profile: {
      title:                 'Mon espace',
      sectionPersonal:       'Données personnelles',
      sectionContacts:       'Contacts',
      sectionSocials:        'Réseaux sociaux',
      sectionNotifications:  'Notifications',
      displayName:           'Nom',
      birthday:              'Date de naissance',
      phone:                 'Téléphone',
      messengerLabel:        'Contacter via',
      messengerWhatsapp:     'WhatsApp',
      messengerTelegram:     'Telegram',
      phoneVerify:           'Vérifier',
      phoneEnterCode:        'Code SMS',
      phoneVerifyConfirm:    'Confirmer le code',
      phoneVerified:         '✓ Vérifié',
      socialLink:            'Ou collez un lien',
      socialLinkPlaceholder: 'https://instagram.com/...',
      connectFacebook:       'Connecter Facebook',
      facebookConnected:     '✓ Facebook connecté',
      notifyShows:           'Nouveaux spectacles et offres',
      notifyBirthday:        'Souhait d\'anniversaire',
      save:                  'Enregistrer',
      saved:                 'Enregistré',
      unsavedWarning:        'Enregistrez les modifications',
      history:               'Mes billets',
      noHistory:             'Aucun billet pour l\'instant',
      notifications:         'Notifications pour les nouveaux spectacles',
      logout:                'Se déconnecter',
      required:              'Champ obligatoire',
      incomplete:            (n) => `Complétez votre profil — encore ${n} champ${n > 1 ? 's' : ''}`,
      visitCount:            (n) => n === 0 ? 'Vous n\'avez encore assisté à aucun spectacle' : `Vous avez assisté à ${n} spectacle${n > 1 ? 's' : ''}`,
      bonusProgress:         (r) => `Encore ${r} visite${r > 1 ? 's' : ''} avant un cadeau`,
      bonusComplete:         '🎁 Vous recevez un cadeau pour le prochain spectacle !',
      ticketCode:            'Code de réservation',
      statusPending:         'En attente',
      statusConfirmed:       'Confirmé',
      statusCancelled:       'Annulé',
      statusAttended:        'Présent',
      payStatusNotPaid:      'Non payé',
      payStatusPaid:         'Payé',
      payStatusAwaiting:     'En attente de virement',
    },
    booking: {
      title:               'Réservation',
      loginRequired:       'Pour réserver, veuillez vous connecter',
      loginBtn:            'Se connecter ou s\'inscrire',
      ticketType:          'Type de billet',
      seatsLeft:           'Places restantes',
      tickets:             'Nombre de billets',
      paymentMethod:       'Mode de paiement',
      payOnSite:           'Paiement sur place',
      payOnSiteDesc:       'Payez en espèces à la caisse du théâtre',
      payTransfer:         'Virement bancaire',
      payTransferDesc:     'Les coordonnées bancaires seront envoyées après la réservation',
      comment:             'Commentaire',
      commentPlaceholder:  'Demandes spéciales, questions...',
      submit:              'Confirmer la réservation',
      submitError:         'La réservation a échoué. Veuillez réessayer.',
      successTitle:        'Réservation acceptée',
      successText:         'Les détails seront envoyés à votre adresse e-mail.',
      successOnSite:       'Votre réservation est acceptée. Les détails seront envoyés par e-mail. Le paiement s\'effectue sur place avant le spectacle.',
      successTransfer:     'Votre réservation est acceptée. Veuillez effectuer le virement selon les coordonnées ci-dessous. Les détails seront envoyés par e-mail.',
      successEmailHint:    'Détails envoyés à :',
      successAmount:       'Montant à payer',
      transferDetailsLabel:'Coordonnées bancaires',
      transferRef:         'Référence du virement',
      close:               'Fermer',
      total:               'Total',
      phone:               'Téléphone de contact',
      labelShow:           'Spectacle',
      labelDate:           'Date',
      labelTickets:        'Billets',
      labelAmount:         'Montant',
    },
    admin: {
      title:           'Panneau d\'administration',
      accessDenied:    'Accès refusé',
      allShows:        'Tous les spectacles',
      bookings:        'réservations',
      totalTickets:    'billets',
      totalRevenue:    'payé',
      noBookings:      'Aucune réservation pour l\'instant',
      name:            'Nom',
      email:           'E-mail',
      phone:           'Téléphone',
      tickets:         'Billets',
      ticketType:      'Type',
      ticketStandard:  'Standard',
      ticketStudent:   'Étudiant',
      amount:          'Montant',
      date:            'Date de réservation',
      payment:         'Paiement',
      paymentStatus:   'Statut paiement',
      status:          'Statut réservation',
      comment:         'Commentaire',
      statusConfirmed: 'Confirmé',
      statusCancelled: 'Annulé',
      statusPending:   'En attente',
      statusAttended:  'Présent',
      payOnSite:       'Sur place',
      payTransfer:     'Virement',
      backToSite:      '← Retour au site',
      filterAll:       'Tous les spectacles',
      markConfirmed:   'Confirmer',
      markCancelled:   'Annuler',
      markAttended:    'Présent',
      bookingsTab:     'Réservations',
      usersTab:        'Spectateurs',
      usersCount:      'spectateurs',
      userCreatedAt:   'Date d\'inscription',
      noUsers:         'Aucun spectateur pour l\'instant',
      filterByStatus:  'Statut :',
    },
    showModal: {
      labelDate:     'Date',
      labelTime:     'Heure',
      labelDuration: 'Durée',
      labelPrice:    'Tarif',
      book:          'Acheter un billet',
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
