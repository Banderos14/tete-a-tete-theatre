// Жанры спектаклей — значения поля tag в src/data/shows.ts.
export type ShowTagKey =
  | 'Поэзия' | 'Поэма' | 'Комедия' | 'Драма'
  | 'Сказка' | 'Цикл' | 'Спектакль' | 'Мюзикл' | 'Моноспектакль';

// Все 12 месяцев: showDate хранится как «14 Июн 2026».
export type MonthKey =
  | 'Янв' | 'Фев' | 'Мар' | 'Апр' | 'Май' | 'Июн'
  | 'Июл' | 'Авг' | 'Сен' | 'Окт' | 'Ноя' | 'Дек';

// интерфейсы T, Lang, Stat

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
    /** Похоже на опечатку в домене почты: подсказка с исправленным адресом. */
    emailTypo: (suggestion: string) => string;
    emailTypoFix: string;
    emailTypoKeep: string;
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
    instagram: string;
    instagramPlaceholder: string;
    instagramInvalid: string;
    instagramOpenProfile: string;
    connectFacebook: string;
    facebookConnected: string;
    notifyShows: string;
    notifyBirthday: string;
    save: string;
    saved: string;
    unsavedWarning: string;
    memberSince: (year: number) => string;
    history: string;
    historyAttended: string;
    noHistory: string;
    notifications: string;
    logout: string;
    required: string;
    phoneInvalid: string;
    birthdayInvalid: string;
    /** Пометка необязательного поля. */
    optional: string;
    incomplete: (n: number) => string;
    visitCount: (n: number) => string;
    /** Правило программы от порога n: «Посетите 4 спектакля — 5-й билет со скидкой 50%». */
    loyaltyRule: (visits: number) => string;
    loyaltyTitle: string;
    /** «3 из 4». */
    loyaltyOf: (done: number, total: number) => string;
    bonusProgress: (remaining: number) => string;
    /** Заголовок, когда скидка доступна. */
    loyaltyAvailable: string;
    bonusComplete: string;
    ticketCode: string;
    statusPending: string;
    statusConfirmed: string;
    statusCancelled: string;
    statusAttended: string;
    payStatusNotPaid: string;
    payStatusPaid: string;
    payStatusAwaiting: string;
    payStatusExpired: string;
    payMethodTransfer: string;
    payMethodOnSite: string;
    payTransferReminder:  (code: string) => string;
    bookingNoteConfirmed: string;
    bookingNoteCancelled: string;
    bookingNotePaid:      string;
    bookingNoteExpired:   string;
  };
  booking: {
    title: string;
    loginRequired: string;
    /** Альтернативный текст постера спектакля на шаге входа. */
    posterAlt: (title: string) => string;
    loginBtn: string;
    ticketType: string;
    tickets: string;
    paymentMethod: string;
    payOnSite: string;
    payOnSiteDesc: string;
    payTransfer: string;
    payTransferDesc: string;
    /** Онлайн-оплата (Stripe Hosted Checkout). Показывается только при VITE_ONLINE_PAYMENT_ENABLED. */
    payOnline: string;
    payOnlineDesc: string;
    /** Кнопка отправки формы при онлайн-оплате: бронь → страница оплаты. */
    submitOnline: string;
    comment: string;
    commentPlaceholder: string;
    submit: string;
    submitError: string;
    successTitle: string;
    // Что делать дальше: где лежит QR и как им пользоваться.
    successOnSite: string;
    successTransfer: string;
    /** Бронь есть, но письмо с билетом не ушло — билет в «Мои билеты». */
    successEmailFailed: string;
    myTickets: string;
    close: string;
    total: string;
    phone: string;
    labelTickets: string;
    labelAmount: string;
    copied: string;
    loyaltyGift: string;
    loyaltyOriginal: string;
    loyaltyDiscount: string;
    loyaltyTotal: string;
    seatsAvailable: (n: number, total: number) => string;
    /** Итог корзины: «4 билета». */
    ticketsTotal: (n: number) => string;
    /** Подпись над числом билетов в итоге формы. */
    quantity: string;
    /** Подписи кнопок −/+ у тарифа (для экранного диктора). */
    addTicket: (label: string) => string;
    removeTicket: (label: string) => string;
    soldOut: string;
    notEnoughSeats: (n: number) => string;
    showAlreadyStarted: string;
    cancelBooking: string;
    cancelBookingTitle: string;
    cancelBookingText: string;
    cancelReasonRequired: string;
    cancelReasonTime: string;
    cancelReasonPlans: string;
    cancelReasonMistake: string;
    cancelReasonOther: string;
    cancelCommentPlaceholder: string;
    cancelConfirm: string;
    cancelByUserLabel: string;
  };
  /** Онлайн-оплата: переход на Stripe, возврат, состояние брони в кабинете. */
  payment: {
    /** Бейдж на карточке «Оплатить онлайн». */
    recommended: string;
    redirecting: string;
    checkoutError: string;
    onlineUnavailable: string;
    checkoutExpired: string;
    resume: string;
    resumeError: string;
    stampAwaiting: string;
    stampRefund: string;
    actionAwaiting: string;
    /** Места удержаны до указанного времени; билет — после оплаты. */
    awaitingNote: (time: string) => string;
    awaitingNoteNoTime: string;
    refundPending: string;
    refunded: string;
    issue: string;
    checkingTitle: string;
    checkingText: string;
    paidTitle: string;
    paidText: string;
    processingTitle: string;
    processingText: string;
    notCompletedTitle: string;
    notCompletedText: (time: string | null) => string;
    inactiveTitle: string;
    inactiveText: string;
    issueTitle: string;
    notFoundTitle: string;
    notFoundText: string;
    signInTitle: string;
    summaryShow: string;
    summaryDate: string;
    signInText: string;
    signIn: string;
    refresh: string;
  };
  admin: {
    title: string;
    accessDenied: string;
    allShows: string;
    bookings: string;
    totalTickets: string;
    /** «мест» — занятые места из вместимости зала в карточке спектакля. */
    seats: string;
    /** «2 бронирования» — число броней с правильным склонением. */
    bookingsCount: (n: number) => string;
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
    /** Оплаченная онлайн бронь: обычной отмены нет — возврат в Stripe. Коротко, в строке таблицы. */
    refundInStripe: string;
    /** Подробности той же инструкции — во всплывающей подсказке. */
    refundInStripeTitle: string;
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
    theme: string;
    profileBtn: string;
  };
  hero: {
    eyebrow: string;
    title: { before: string; letter: string; after: string };
    // Доступное имя h1: визуально заголовок разбит на три span-а,
    // и скринридер читает их слитно («тетатет»).
    titleLabel: string;
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
    mapLoading: string;
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
    showPast: string;
    readMore: string;
    readLess: string;
  };
  // Действия с PDF в раскрытом билете (TicketCard).
  ticketPdf: {
    download: string;
    share: string;
    preparing: string;
    iosHint: string;
    errorGenerate: string;
    errorShare: string;
    errorPreviewBlocked: string;
  };
  // Публичная страница билета /#/ticket — открывается без входа.
  publicTicket: {
    title: string;
    checking: string;
    codeLabel: string;
    instruction: string;
    qrFailed: string;
    statusUnknown: string;
    invalidTitle: string;
    invalidText: string;
    notFoundTitle: string;
    notFoundText: string;
    cancelledTitle: string;
    cancelledText: string;
    refundedTitle: string;
    refundedText: string;
    attendedTitle: string;
    attendedText: string;
    pendingTitle: string;
    pendingText: string;
    rowShow: string;
    rowDate: string;
    rowSeats: string;
    rowTickets: string;
    rowPayment: string;
    paid: string;
    onSite: (amount: number) => string;
    transfer: string;
    myTickets: string;
    spectatorHint: string;
    openTicket: string;
    accountCta: string;
    safariHint: string;
    copyLink: string;
    linkCopied: string;
    copyFailed: string;
  };
  // Ключи перечислены явно: раньше здесь стоял Record<string, string>, и
  // компилятор молча пропускал пропуски — во французской версии выводились
  // русские «Поэзия», «Сен», «Окт».
  showTags: Record<ShowTagKey, string>;
  months: Record<MonthKey, string>;
}
