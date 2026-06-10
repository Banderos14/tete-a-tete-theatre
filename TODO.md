# Tête-à-Tête Theatre — Задачи

## Адаптив

-+- Мобильная версия (375px–430px)
-+- Планшеты и iPad
-+- Hero — нормально выглядит на телефоне
-+- Header / Navbar адаптирован под mobile
-+- Бургер-меню с навигацией, языком, темой и входом
-+- Burger menu содержит навигацию, язык, тему и вход/профиль
-+- AuthModal адаптирована под mobile
-+- BookingModal адаптирована под mobile
-+- ProfileDrawer dashboard адаптирован под mobile
-+- TicketCard адаптирован под mobile
-+- TicketCheckPage адаптирована под mobile
-+- Mobile hero polish
-+- Mobile burger menu polish
-+- Mobile afisha padding / carousel touch polish
-+- Mobile show modal scroll lock
-+- Mobile contacts padding / email wrap / map fix
-+- Mobile footer centered layout
-?- Горизонтальный скролл — проверить на реальном телефоне
-?- Проверить на реальном iPhone 375–430px
-?- Marquee — читаемость на маленьком экране
--- About — упростить сетку на мобильном
--- Footer — проверить на экране 320px

## Производительность

-+- Тяжёлая анимация сцены отключена на мобильных
-+- Анимация кулис пропускается на мобильных
-+- Шрифты Bad Russian и Forum — самостоятельный хостинг (woff2)
-+- Шрифт Ekaterina Velikaya Two — конвертирован в woff2
-+- Картинки переведены в WebP — спектакли и команда
-+- Карта загружается отдельно, не блокирует страницу
-+- Firebase, React, модали вынесены в отдельные chunks
-+- main bundle уменьшен с 700KB до 78KB (подтверждено на production)
--- Dela Gothic One остаётся на Google CDN — нормально, CDN сам режет лишнее
--- Добавить размеры к img-тегам (убрать прыжки при загрузке)

## Функционал — проверить после деплоя

-?- Регистрация нового пользователя
-?- Вход через email / Google
-?- Личный кабинет — данные, история посещений
-?- Бронирование — только для авторизованных
-?- Переключение языка RU / FR
-?- Тёмная / светлая тема
-?- Бургер-меню — все ссылки работают
-?- Ссылка ?show=<id> — переход и подсветка карточки
-?- Консоль — без ошибок (проверить в браузере)
-+- Карта — исправлена ошибка 401, OSM тайлы отвечают HTTP 200
-?- PageSpeed Mobile / Desktop — проверить вручную на pagespeed.web.dev
-?- Горизонтальный скролл на реальном телефоне

## Репертуар и афиша

--- Новые спектакли сверху, прошедшие снизу
--- Кнопка "купить" только у активных спектаклей
--- Instagram: ссылка из сторис → прокрутка к нужной афише + подсветка
--- Кулисы: поиграться с задержкой и цветом

## Бронирование / Оплата

-+- Структура брони: id, userId, userEmail, userName, userPhone, showId, showTitle,
    showDate, showTime, ticketsCount, ticketType, priceInfo, totalAmount, ticketCode,
    status (pending/confirmed/cancelled/attended), paymentMethod, paymentStatus,
    comment, createdAt, updatedAt
-+- Статус брони: pending (новая) → confirmed / cancelled / attended
-+- Генерация уникального ticketCode при создании (формат XXXX-XXXX, crypto.getRandomValues)
-+- updatedAt проставляется при каждой смене статуса или оплаты
-+- bank_transfer — способ оплаты, показывает реквизиты
-+- on_site — оплата на месте, без реквизитов
-+- ticketCode — отображается в модалке, письме и личном кабинете
-+- Копирование реквизитов в буфер одной кнопкой
-+- paymentStatus в админке: not_paid / awaiting_transfer / paid
-+- "Оплачено" атомарно ставит paymentStatus=paid + status=confirmed (одна запись Firestore)
-+- Одно письмо при нажатии "Оплачено": оплата получена + место подтверждено
-+- attended считается автоматически: confirmed + paid + спектакль закончился 2+ ч назад
    (attendanceService.ts: при загрузке AdminPage обновляет Firestore, ProfileDrawer считает вычисленно)
-+- Кнопка "Посещение" удалена из основного UI — посещение ставится автоматически
-+- "Подтвердить вручную" — только для on_site, второстепенная кнопка
-+- ProfileDrawer корректно считает посещения (status=attended + computed)
-+- transferCodeWarning: заметное предупреждение о коде брони в назначении платежа
-+- ticketCode используется для связи платежа и брони
-+- QR использует production URL (VITE_PUBLIC_SITE_URL), не localhost
-+- Регион оплаты удалён: банковский перевод всегда через французский IBAN / SEPA
-+- Loyalty reward обновляется realtime без refresh (subscribeToUserBookings в BookingModal)
-+- BookingModal пересчитывает скидку при изменении bookings автоматически
-+- IBAN показывается в двух форматах: с пробелами и без (две кнопки копирования)
-+- Email предупреждает, что некоторые банки требуют IBAN без пробелов


## Личный кабинет

-+- Вход только после регистрации (email или Google)
-+- Профиль: имя, email, телефон, день рождения, соц сеть
-+- Подключение Facebook для авто-заполнения данных
-+- Уведомления — настройка в профиле
-+- История разделена на две секции:
    «Мои билеты» (pending / confirmed / cancelled — активные и будущие)
    «Мои спектакли» (attended / computed attended — посещённые)
-+- Карточка билета: глиф спектакля с цветом палитры, название, дата, код, статусы оплаты и брони
-+- Счётчик посещений и прогресс-бар в секции «Мои спектакли»
-+- Статус брони и оплаты в карточке
-+- Код брони в карточке
-+- Прогресс-бар: каждое 5-е посещение — подарок (5 точек, заполняются)
-+- Явные статусные сообщения: «Бронь подтверждена», «Бронь отменена», «Оплата получена»
-+- ProfileDrawer переделан как dashboard-модал (по центру, max-width 1050px, 88vh)
-+- Sidebar: аватар, имя, email, навигация по секциям (Личные данные / Контакты / Соцсети / Уведомления / Мои билеты / Мои спектакли / Выход)
-+- TicketCard compact/expanded: свёрнутый заголовок (название + дата + код + статус) → раскрытый (QR + детали)
-+- QR видно только в раскрытой карточке (lazy-loaded при первом открытии)
-+- Одновременно раскрыта одна карточка (предыдущая сворачивается)
-?- Мобильный вид личного кабинета — вкладки работают, полировка возможна
--- День рождения → поздравление от театра + подарок
--- Привязка соц сети через кнопку входа, а не вручную

## Loyalty (система лояльности)

-+- 1 посещение = 1 attended booking, независимо от ticketsCount
-+- Каждые 5 посещений — скидка 50% на следующий спектакль
-+- Скидка применяется автоматически в BookingModal (пользователь ничего не вводит)
-+- Скидка использует правило: Math.floor(attended / 5) > usedRewardCount
-+- После использования скидки новая доступна через 5 следующих посещений (10 / 15 / 20...)
-+- loyaltyService.ts: чистые функции без side effects
    (getUserAttendedCount, getUsedRewardCount, hasAvailableLoyaltyReward,
     calculateLoyaltyDiscount, nextRewardThreshold, cycleProgress)
-+- Booking хранит: originalAmount, loyaltyDiscountApplied, loyaltyDiscountAmount,
    loyaltyRewardUsedFromVisitCount
-+- BookingModal: блок "🎁 Ваш подарок: −50%" с разбивкой Исходная / Скидка / К оплате
-+- Success step показывает строки скидки в сводке брони
-+- ProfileDrawer: VisitCounter различает три состояния:
    бонус доступен / бонус использован (следующий после N) / прогресс до первого
-+- Прогресс-бар учитывает использованные бонусы (не застревает на 5/5 после использования)
-+- Email: confirmation показывает Исходная / Скидка / К оплате при loyaltyDiscountApplied
-+- AdminPage: badge «−50% скидка» + зачёркнутая исходная сумма в колонке суммы
-?- Проверить вручную: сценарий A–G (4 / 5 / использован / 10 посещений, ticketsCount=5)

## Администратор

-+- Страница /admin — только для роли admin
-+- Авто-редирект если не admin
-+- Вкладка "Бронирования": список, фильтр по спектаклю и по статусу
-+- Вкладка "Зрители": список зарегистрированных пользователей
-+- Смена статуса брони: confirmed / attended / cancelled
-+- Смена статуса оплаты: not_paid / awaiting_transfer / paid
-+- updatedAt обновляется при смене статуса
-+- Таблица: имя, email, спектакль, дата, сумма, способ оплаты, статус оплаты, статус брони, ticketCode
-+- Ручная рассылка при новых спектаклях (вкладка «Рассылка» в AdminPage)

## Безопасность

-+- /admin защищён на уровне клиента
-+- firestore.rules — рекомендованный файл создан (развернуть вручную)
-+- Firebase Auth → Authorized domains: добавлены theatre-teteatete.fr и www.theatre-teteatete.fr
-?- Развернуть firestore.rules: firebase deploy --only firestore:rules
    (rules написаны, но не задеплоены — если тест-режим истёк, reads будут blocked)
-?- Проверить Google Sign In и Email/Password на production-домене theatre-teteatete.fr
--- Content Security Policy (vercel.json)

## Email / Уведомления

Готово:
-+- Подтверждение бронирования на почту: одно письмо после создания брони
-+- Одно письмо на одну бронь: без дублей и без второго письма с реквизитами
-+- Реквизиты оплаты в письме при bank_transfer
-+- Email без реквизитов при on_site
-+- Email при подтверждении брони администратором
-+- Email при отмене брони администратором
-+- Email при отметке «Оплачено»
-+- Защита от дублей: если статус не изменился, письмо повторно не отправляется
-+- api/send-email.ts: Vercel Serverless Function через Resend
-+- emailService.ts: шаблоны RU/FR для всех событий бронирования
-+- Все письма от администратора отправляются на FR (язык театра и аудитории)
-+- FR копии обновлены: «Réservation reçue», «Merci pour votre réservation !»,
    «Paiement reçu · votre place est confirmée», тёплая отмена
-+- Confirmation email полностью переведён на FR: «Libellé du virement», «obligatoirement»
-+- isRU = data.lang === 'RU' во всех builder-функциях; FR — fallback по умолчанию
-+- paymentPurpose использует FR-название спектакля + FR-отформатированную дату
-+- AdminPage: длинный комментарий не вылезает за кнопки (word-break, overflow-wrap, flex-shrink)
-+- Рассылка нового спектакля подписчикам (ручной запуск из AdminPage → вкладка «Рассылка»)
-+- getUsersForNewsletter(): только пользователи с notifications=true, не admin
-+- AdminPage: выбор спектакля, подтверждение, результат (sent / errors)
-+- Защита от двойного клика: кнопка disabled пока идёт отправка

Настройка Resend (выполнено):
-+- RESEND_API_KEY добавлен в Vercel Dashboard → Settings → Environment Variables
-+- EMAIL_FROM = contact@theatre-teteatete.fr (домен подтверждён в Resend, Status: Verified)
-+- Домен theatre-teteatete.fr верифицирован в Resend: DKIM, SPF и MX настроены
-+- Отправка идёт на любой адрес, не только на аккаунт Resend

Не делать сейчас:
--- Поздравление с днём рождения + подарок
--- Автоматическая birthday-рассылка

## Билеты + QR-code

-+- ticketCode генерируется при бронировании (формат XXXX-XXXX)
-+- ticketCode хранится в Firestore вместе с бронью
-+- ticketCode отображается в истории бронирований (личный кабинет)
-+- PDF-билет реализован: кнопка "Скачать PDF" в expanded TicketCard (ticketPdfService.ts, jspdf, lazy chunk)

## QR Ticket System

-+- Генерация QR (qrService.ts: generateTicketQR → payload { ticketCode })
-+- TicketCard (src/components/ui/TicketCard/): название, дата, код, QR-код
-+- Страница сканирования (/admin/checkin: html5-qrcode, только admin)
-+- Проверка билета (paid+confirmed → зелёный; cancelled/not_paid/attended → ошибка)
-+- Отметка посещения (кнопка "Отметить посещение" → status = attended)
-+- QR содержит URL проверки: /admin/checkin?ticket=XXXX-XXXX (читается обычной камерой iPhone)
-+- /admin/checkin поддерживает ?ticket= — автоматически ищет бронь, не запускает сканер
-+- Обратная совместимость: сканер парсит и старый JSON, и новый URL, и raw-код
-+- PDF содержит QR, ticketCode, детали спектакля, адрес, имя зрителя
-+- PDF всегда на латинице/французском: кириллица транслитерируется, "???" исключены
-+- TicketCard: плавное раскрытие и закрытие (grid-template-rows + opacity)
-+- ProfileDrawer: плавное открытие и закрытие (visibility + opacity на overlay и modal)

## i18n

-+- Переводы RU / FR разделены по файлам:
    src/i18n/types.ts        — интерфейс T (единый источник правды)
    src/i18n/ru.ts           — русский перевод
    src/i18n/fr.ts           — французский перевод
    src/i18n/index.ts        — точка сборки
    src/i18n/translations.ts — compatibility re-export (старые импорты не ломаются)
-+- TypeScript проверяет совпадение ключей RU и FR через тип T

## SEO / Meta

-+- Мета-описание, title, lang
-+- OpenGraph и Twitter Card
--- Картинка 1200×630 для соцсетей
--- Sitemap.xml и robots.txt

## Инфраструктура

-+- Vercel — деплой работает
-+- iframe-заголовки настроены
--- Cloudflare — DNS, безопасность, кэш, аналитика
--- Мониторинг ошибок (Sentry)
--- Custom domain (уже есть: theatre-teteatete.fr зарегистрирован в OVHcloud, подключён к Vercel)

## Email & Domain Setup (June 2026)

-+- Домен theatre-teteatete.fr зарегистрирован через OVHcloud
-+- Домен подключён к Vercel (основной сайт)
-+- Основной email театра: contact@theatre-teteatete.fr
-+- Почтовый ящик создан и протестирован через OVH Zimbra Starter (15 GB)
-+- Входящие письма: OVH Zimbra Webmail
-+- Исходящие письма с сайта: Resend (домен theatre-teteatete.fr верифицирован)
-+- DNS-записи Resend настроены: DKIM (resend._domainkey), SPF (send), MX (send)

### Important

Если в будущем потребуется сменить почтового провайдера или переносить домен,
необходимо сохранить DNS-записи Resend (DKIM / SPF / MX), иначе перестанет работать
отправка писем с сайта:
  - resend._domainkey  (DKIM)
  - send MX
  - send SPF

## Качество кода / UI

-+- Комментарии очищены от декоративных разделителей
-+- Border-radius увеличен и вынесен в общую систему переменных
-+- BookingModal разделён на BookingFormStep и BookingSuccessStep
-+- Форма бронирования возвращена к обычному form layout
-+- Ticket-like дизайн оставлен только для success step
-+- Остаток мест скрыт из пользовательского UI
-+- Success-модалка бронирования упрощена: реквизиты не дублируются, пользователь получает их по email
