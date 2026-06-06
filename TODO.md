# Tête-à-Tête Theatre — Задачи

## Адаптив

-+- Мобильная версия (375px–430px)
-+- Планшеты и iPad
-+- Hero — нормально выглядит на телефоне
-+- Бургер-меню с навигацией, языком, темой и входом
-?- Горизонтальный скролл — проверить на реальном телефоне
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

## Бронирование (Этап 5 — июнь 2026)

-+- Структура брони: id, userId, userEmail, userName, userPhone, showId, showTitle,
    showDate, showTime, ticketsCount, ticketType, priceInfo, totalAmount, ticketCode,
    status (pending/confirmed/cancelled/attended), paymentMethod, paymentStatus,
    comment, createdAt, updatedAt
-+- Статус брони: pending (новая) → confirmed / cancelled / attended (admin)
-+- Генерация уникального ticketCode при создании (формат XXXX-XXXX, crypto.getRandomValues)
-+- updatedAt проставляется при каждой смене статуса или оплаты
-?- Email-подтверждение бронирования (emailService.ts готов, нужен бэкенд-эндпоинт)
--- Vercel Serverless Function /api/send-email — создать и подключить
--- Добавить в .env: VITE_EMAIL_ENDPOINT=/api/send-email
--- Добавить в Vercel Dashboard (и .env локально, без VITE_ префикса):
    EMAIL_API_KEY, EMAIL_FROM, EMAIL_PROVIDER (sendgrid | resend)
--- PDF-билет: архитектура готова в ticketService.ts, нужен npm install jspdf

## Личный кабинет

-+- Вход только после регистрации (email или Google)
-+- Профиль: имя, email, телефон, день рождения, соц сеть
-+- Подключение Facebook для авто-заполнения данных
-+- Уведомления — настройка в профиле
-+- История бронирований пользователя (загружается из Firestore при открытии)
-+- Статус брони и оплаты в карточке
-+- Код брони в карточке
-+- Счётчик посещений (отметка attended = посещение)
-+- Прогресс-бар: каждое 5-е посещение — подарок (5 точек, заполняются)
--- День рождения → поздравление от театра + подарок
--- Привязка соц сети через кнопку входа, а не вручную

## Администратор

-+- Страница /admin — только для роли admin
-+- Авто-редирект если не admin
-+- Вкладка "Бронирования": список, фильтр по спектаклю и по статусу
-+- Вкладка "Зрители": список зарегистрированных пользователей
-+- Смена статуса брони: confirmed / attended / cancelled
-+- Смена статуса оплаты: not_paid / awaiting_transfer / paid
-+- updatedAt обновляется при смене статуса
--- Автоматическая рассылка при новых спектаклях

## Безопасность

-+- /admin защищён на уровне клиента
-+- firestore.rules — рекомендованный файл создан (развернуть вручную)
--- Развернуть firestore.rules: firebase deploy --only firestore:rules
--- Content Security Policy (vercel.json)

## Email / Уведомления

-+- emailService.ts: sendBookingConfirmationEmail + sendBookingStatusUpdateEmail, RU/FR шаблон
-+- Вызывается после создания брони (не блокирует, ошибки — в консоль)
-+- api/send-email.ts — Vercel Serverless Function (Resend): валидация, security, graceful fallback
-+- VITE_EMAIL_ENDPOINT по умолчанию /api/send-email (без env-переменной на frontend)
-+- .env.example — шаблон переменных (Firebase + Resend)
-?- Реальная отправка: добавить RESEND_API_KEY и EMAIL_FROM в Vercel Dashboard
--- Email при смене статуса брони (sendBookingStatusUpdateEmail готова, нужно подключить в AdminPage)
--- Рассылка при новых спектаклях подписчикам
--- Поздравление с днём рождения + подарок

## Билеты

-+- ticketCode генерируется при бронировании (formат XXXX-XXXX)
-+- ticketCode хранится в Firestore вместе с бронью
-+- ticketCode отображается в истории бронирований (личный кабинет)
-+- ticketService.ts: архитектура PDF готова (jspdf, закомментировано)
--- PDF-билет: npm install jspdf → раскомментировать generateTicketPdf

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
--- Custom domain
