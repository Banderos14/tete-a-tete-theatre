# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Проект русскоязычный: комментарии в коде, доки и UI-тексты пишутся по-русски (UI — ещё и по-французски через i18n).

## Работа с репозиторием

**Не создавай и не используй Git worktrees, если пользователь не попросил об этом явно.** Работай прямо в корне открытого репозитория.

## Команды

```bash
npm run dev      # Vite dev server на порту 5174 (host: true — доступен по LAN)
npm run build    # tsc -b && vite build — обязательная проверка после любой задачи
npm run lint     # eslint .
npm run preview  # предпросмотр собранного dist
npm test         # юнит-тесты (vitest)
npm run test:rules  # тесты правил Firestore в эмуляторе (нужна Java)
```

- **Тесты:** `npm test` (vitest, только чистая логика и проверки исходников — без сети и Firebase). Правила Firestore покрыты отдельно: `npm run test:rules`, требует Firebase Emulator и установленную Java. Ручной чеклист в `AUTH_TESTING.md` остаётся для авторизации, бронирования и писем.
- **`/api/*` не работает под `npm run dev`.** Vite не поднимает serverless-функции. Для работы с любым endpoint из `api/` запускай `vercel dev` (нужен `vercel link` и заполненный `.env`). Без этого остаток мест неизвестен (индикатор скрывается), а бронирование, отмена и проверка билетов недоступны.
- Правила Firestore деплоятся отдельно: `npx -y firebase-tools@latest deploy --only firestore:rules`.
- **Тесты правил требуют Java.** `npm run test:rules` поднимает Firebase Emulator, а он работает на JVM. Без установленной Java команда завершится сообщением `Unable to locate a Java Runtime` — это не ошибка проекта.

## Архитектура

Vite + React 19 + TypeScript, SCSS-модули, без UI-библиотек. Firebase (Auth + Firestore) на клиенте, Vercel Serverless Functions (`api/`) для всего, что нельзя доверить браузеру.

### Слои и границы

```
api/       тонкие handler'ы Vercel — разбор запроса, авторизация, вызов сервиса, ответ
server/    серверная логика: booking, checkin, availability, audience, expiration, users, email, shared
shared/    изоморфный слой: domain (правила), catalog (каталог спектаклей), contracts (типы API и лимиты)
src/       frontend
```

**Vercel делает endpoint'ом каждый `.ts` верхнего уровня `api/`** — поэтому общий код живёт вне `api/`, а список файлов там зафиксирован тестом: переименование меняет публичный URL.

Границы проверяет `tests/unit/architecture.test.ts`:

- `src/` не импортирует `server/`, `api/`, `firebase-admin` и серверные модули Node;
- `shared/` изоморфен — не тянет `server/`, `api/`, `src/` и `firebase-admin`;
- серверные переменные окружения (`RESEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `CRON_SECRET`, `EMAIL_FROM`) не читаются из frontend-кода;
- handler'ы не содержат `runTransaction`/`getFirestore` и укладываются в 80 строк.

Сервисы не знают про HTTP: они бросают `ApiError` (`server/shared/errors.ts`), а handler переводит её в статус и тело через `errorResponse()`. Поэтому бизнес-правило читается и тестируется без `req`/`res`.

### Роутинг и структура приложения

`main.tsx` оборачивает всё в **HashRouter** — это принципиально: все внешние ссылки, QR-коды и deep-links строятся в формате `/#/...` (см. `src/services/qrService.ts`, `src/utils/showUrl.ts`). Обычный path-роутинг сломает прямые переходы.

`src/app/App.tsx` — оболочка: провайдеры, глобальный стейт (тема, язык, открытые модалки) и четыре роута: `/` (`HomePage`), `/admin`, `/admin/checkin`, `*`. Модалки (`AuthModal`, `ProfileDrawer`, `BookingModal`) вынесены **за пределы `<Routes>`** и лениво грузятся — чтобы не пересоздаваться при навигации. Их чанки префетчатся в `requestIdleCallback` после завершения интро.

Страницы лежат каждая в своём каталоге и держат рядом то, что используют только они:

```
src/
  app/          оболочка: App, UserLanguageSync, параметры интро
  pages/
    HomePage/   HomePage.tsx + sections/ (11 секций лендинга) + components/ (ShowModal, LazyBgVideo, PosterPlaceholder)
    AdminPage/  AdminPage.tsx (оболочка) + *Tab.tsx + useAdminData / useNewsletter
    NotFoundPage/  TicketCheckPage/
  components/ui/  переиспользуемый UI: модалки, ErrorBoundary, ConfirmDialog, TicketCard, CookieConsent
  context/ services/ hooks/ i18n/ data/ config/ constants/ types/ utils/ styles/
```

Границы стережёт тот же `tests/unit/architecture.test.ts`: страницы не импортируют друг друга и не лезут в `src/app/`, общий UI не зависит от страниц, у каждой страницы есть `index.ts`. Компонент, понадобившийся второй странице, поднимается в `components/ui/` — а не импортируется из чужого каталога.

**Крупные экраны разложены по ответственностям, а не по числу строк.** `ProfileDrawer/` и `AdminPage/` устроены одинаково: файл-оболочка отвечает за раскладку и переключение разделов, состояние живёт в хуках (`useProfileForm`, `useProfileBookings`, `useAdminData`, `useNewsletter`), содержимое разделов — в отдельных `*Section` / `*Tab`-файлах, а чистая логика (`profileValidation`, `attendedGrouping`, `adminFormatting`) выносится в модули без React и покрывается тестами.

**Файлы такого разбиения лежат плоско, рядом со своим `*.module.scss`.** Подкаталоги здесь невозможны: `architecture.test.ts` запрещает импортировать модуль стилей из соседнего каталога, а дробить SCSS вслед за компонентами означало бы ломать общий каскад.

Firebase грузится лениво из `AuthContext` (`loadFirebase()` мемоизирует `import('../firebase/config')`) — firebase-чанк вынесен в `manualChunks` и не блокирует первый рендер.

### Бронирование — критичный поток

Клиент **не может** создать бронь напрямую: в `firestore.rules` для `bookings` стоит `allow create: if false`. Весь поток:

1. `BookingModal` собирает только `showId, items[{ticketType, quantity}], paymentMethod, comment, phone, lang` — в одной брони может быть несколько тарифов (прежний формат `ticketType × ticketsCount` сервер тоже принимает).
2. `createBookingViaApi()` (`src/services/bookingService.ts`) шлёт это в `/api/create-booking` с `Authorization: Bearer <Firebase ID token>`.
3. `server/booking/booking.service.ts` через Admin SDK сам считает цену, скидку лояльности, `ticketCode`, `status`, `paymentStatus` — клиентские значения игнорируются. Цена корзины — `priceBasket()` в `shared/domain/ticketBasket.ts` (одна формула для сервера и формы); состав пишется в `ticketItems`, у старых броней его нет — читать через `bookingTicketLines()`. Хендлер `api/create-booking.ts` только разбирает запрос и переводит ошибку сервиса в HTTP-ответ.

**Спектакли — один источник фактов:** `SEASON_CATALOG` в `shared/catalog/shows.ts` (id, название RU/FR, дата и время, тарифы и цены, `published`). `src/data/shows.ts` хранит только оформление (`SHOW_CONTENT`: постер, фото, описание, возраст, длительность) и собирает из них `SHOWS`; Афиша, Репертуар, форма брони, админка и сканер читают одно и то же. Новый спектакль = запись в `SEASON_CATALOG` + запись в `SHOW_CONTENT` (и в `REPERTOIRE_CONTENT`, если нужна карточка репертуара) с тем же id. `published: false` — заготовка: её нет на сайте, в продаже, в сканере и среди активных карточек админки; старые брони по ней читаются. Контракт — `tests/unit/pastShows.test.ts`.

**Браузер не пишет в `bookings`** (кроме протухания своего просроченного перевода зрителем — это разрешают правила). Админ бронь только читает; все изменения — через серверные функции:

| Действие | Endpoint | Что проверяет сервер |
|---|---|---|
| создание брони | `POST /api/create-booking` | токен, вместимость зала, «спектакль не в прошлом», лояльность, идемпотентность — всё в одной транзакции; затем письмо-билет с QR |
| отмена зрителем | `POST /api/cancel-booking` | владение бронью и правила отмены (оплаченную и посещённую отменить нельзя) |
| все админские действия с бронью | `POST /api/admin-booking` | роль admin; `inspect`, `mark_attended`, `mark_paid`, `group_checkin` (по коду билета + `showId`), `mark_unpaid`, `cancel`, `resend_ticket`, `delete` (по id брони) — сервер сам читает бронь, проверяет переход и спектакль, пишет аудит, шлёт письмо |
| остаток мест | `GET /api/show-availability` | публичный, отдаёт только числа |
| рассылка анонса | `GET/POST /api/newsletter` | роль admin; получатели, квота Resend и повторная проверка лимита перед первым письмом |
| учёт нового зрителя | `POST /api/register-audience` | ровно один инкремент на пользователя |
| протухание переводов | `GET /api/expire-bookings` | вызывается Vercel Cron раз в сутки (чаще Hobby-план не даёт), защищён `CRON_SECRET` |

**Вместимость** проверяется на сервере внутри транзакции. Отменённые и протухшие брони места не занимают. Документы `showCounters/{showId}` и `loyaltyState/{uid}` служат точками конфликта, чтобы параллельные транзакции гарантированно сериализовались, — авторитетное число мест при этом всегда пересчитывается запросом.

**Правила отмены зрителем:** `paid` — нельзя (оплата окончательна, автовозвратов нет), `attended` — нельзя, `cancelled` — повторно нельзя, иначе можно до начала спектакля.

**Время спектакля** считается одной реализацией (`shared/domain/showTime.ts`): настенное время Europe/Paris переводится в абсолютный момент с учётом перехода на летнее/зимнее время. Новые брони хранят `showStartAt`.

### Роль admin

`userProfile.role` живёт в `users/{uid}`. Правила Firestore запрещают клиенту менять своё `role` (проверка `request.resource.data.role == resource.data.role` на update и `== 'user'` на create). `AdminPage` — это только UI-гейт; настоящая проверка на сервере: `requireAdmin()` в `server/shared/auth.ts` резолвит роль из Firestore по ID-токену — одно место для всех endpoint'ов.

Клиент не отправляет писем и не присылает HTML: письма собирает сервер из шаблонов `shared/email/` по документу брони.

### Рассылка и квота Resend

Рассылка идёт **только** через `/api/newsletter` (admin): `GET` — preflight (число получателей, `sentToday`, лимит, оценочный остаток), `POST` — отправка. Эндпоинта «отправить произвольное письмо» больше нет.

- Спектакли в выпадающем списке — `PUBLISHED_SHOWS`, тот же список, что у Афиши. Третьего списка нет.
- Получателей собирает сервер (`newsletter.recipients.ts`): уведомления включены, email валиден, не admin, адреса дедуплицированы. Адреса в браузер не уходят; черновик письма клиент собирает с меткой `NEWSLETTER_NAME_TOKEN`, имя подставляет сервер.
- Дневной лимит — `resolveDailyLimit()` в `server/email/resendQuota.ts` (Free = 100, переопределяется `RESEND_DAILY_LIMIT`). Прямого API остатка у Resend нет: `sentToday` берётся из заголовка `x-resend-daily-quota`, иначе из `GET /emails` за UTC-сутки, иначе из `emailLog`; берётся максимум. Считаются **все** письма аккаунта. Заголовки `ratelimit-*` — лимит запросов в секунду, к квоте не относятся.
- Перед первым письмом сервер заново проверяет квоту под блокировкой `newsletterLocks/send`. Не хватает — 409 `insufficient_quota`, не отправлено ни одного письма. Ошибка Resend посреди отправки останавливает рассылку без повторов.
- Отправка — Batch API Resend, до 100 писем за запрос, у каждого письма один адресат.

### Билеты и посещения

- Код билета генерируется **только на сервере** (`generateTicketCode()` в `server/booking/ticketCode.ts`): формат `XXXX-XXXX`, алфавит без похожих символов (`0/O`, `1/I/L`), `randomInt` без modulo bias. Клиентского `ticketService` больше нет.
- QR ведёт на `/#/admin/checkin?ticket=CODE`; формат ссылки один на кабинет, PDF и письмо — `ticketCheckUrl()` в `shared/domain/ticketCode.ts`. `parseTicketCodeFromScan()` разбирает hash-URL, обычный URL, легаси-JSON и голый код; ручной ввод нормализует `normalizeTicketCodeInput()`.
- **Один билет — один QR везде.** Содержимое QR строит только `ticketQrPayload()` (`shared/domain/ticketCode.ts`) из кода брони: кабинет, PDF и письмо дают один и тот же QR. Код брони выдаётся один раз и не меняется.
- **Письма-билеты отправляет только сервер** (`server/email/ticketEmail.service.ts`, шаблоны — `shared/email/`): после брони (`/api/create-booking`), после оплаты, при отмене админом и по кнопке «Отправить билет» (`/api/admin-booking`). QR вкладывается inline (`cid:ticket-qr`); если картинку построить или доставить не удалось — письмо уходит без неё. Сбой письма бронь не откатывает; результат пишется в `bookings/{id}.emails.<trigger>`, по нему же работает идемпотентность (повтор события второе письмо не шлёт).
- **Проход — без временных окон.** Сканер присылает `showId` спектакля, на котором стоит сотрудник; сервер пускает только билеты этого спектакля (`isBookingForShow()` в `shared/domain/performance.ts`: showId + момент начала), иначе `wrong_show`. Отменённые/аннулированные — нет, повторный проход — `already_attended` с временем первого.
- Неоплаченную бронь (оплата на месте или непришедший перевод) сканер проводит кнопкой «Принять XX € и пропустить» — `group_checkin`, оплата и проход одной транзакцией, сумма — `totalAmount` брони.
- `attendanceService` парсит `showDate` формата `"17 Май 2026"` (русские трёхбуквенные месяцы) — бронь считается посещённой через 2 часа после начала при `confirmed` + `paid`. `computedIsAttended()` даёт статус до записи в Firestore, поэтому UI не ждёт бэкенд.
- `loyaltyService`: 1 посещение = 1 бронь (не билет); каждые 5 посещений — скидка 50%, округление вниз. Учёт использованных бонусов идёт по флагу `loyaltyDiscountApplied` в брони.

### i18n

Два языка, `RU` и `FR`, оба словаря обязаны совпадать по ключам с типом `T` в `src/i18n/types.ts` — расхождение ловится компилятором. Тексты берутся через `const { t, lang } = useLang()`. Язык хранится в `localStorage` и синхронизируется в профиль пользователя (`UserLanguageSync` в `App.tsx`). Данные спектаклей и команды дублируют перевод суффиксом `FR` (`titleFR`, `descFR`, `priceFR`).

**Любая новая строка добавляется сразу в `ru.ts`, `fr.ts` и `types.ts`.**

### Стили

- `src/styles/variables.scss` — `@font-face`, CSS-переменные для тёмной темы в `:root` и светлой в `[data-theme='light']`. Тема переключается атрибутом на `<html>`.
- `src/styles/mixins.scss` — брейкпоинты `mobile` (900), `tablet` (1100), `small` (600), `tiny` (500), `tinyXS` (720) и типографские миксины.
- Компонентные стили — только `*.module.scss` рядом с компонентом. Цвета берутся из CSS-переменных, не хардкодятся.

### Деплой

Прод — Vercel (`vercel.json`: заголовки кеширования, `/api/*` функции), домен `https://www.theatre-teteatete.fr`. В репозитории есть ещё `.github/workflows/deploy.yml` для GitHub Pages, который собирает только фронт — там `/api/*` не существует, так что это не полноценное окружение.

Секреты (`RESEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `ALLOWED_ORIGIN`, `CRON_SECRET`) — **без префикса `VITE_`**, иначе они попадут в бандл. Описание всех переменных — в `.env.example`.

## Дизайн-система редизайна 2026 (модалки и кабинет)

Брифы задач лежат в `design-refs/NN_*.md`. Каждый бриф ссылается на HTML-референс — **этих HTML-файлов в репозитории нет**, поэтому при задаче на редизайн работай по тексту брифа и палитре ниже, а если бриф без HTML непонятен — спроси файл у пользователя, не выдумывай. Пути к файлам в брифах местами устаревшие (`src/components/BookingModal/` вместо реального `src/components/ui/BookingModal/`) — сверяйся с деревом.

### Палитра

- `$modal-bg: #1c1916` — фон модалок
- `$field-bg: #26211c` — тёплый фон полей и активных карточек
- `$stub-burgundy: #4a1414` — бордовая панель/корешок
- `$cream: #f3e7dc` — крем (светлый текст, бумага)
- `$cream-dim: #d9a89a` — приглушённый крем на бордовом
- `$muted: #9c938a` / `$muted-deep: #6e675f` — вторичный / третичный текст
- `$paper: #f3e7dc`, `$paper-card: #fdfaf6`, `$paper-ink: #241a16` — бумажная часть билета
- `$stamp-green`: border `#5a8a5a` / text `#7fb07f`; `$stamp-amber`: border `#b08a3e` / text `#cdb27a`
- Акцент — существующий `var(--accent)`

### Правила

- Бордеры: 0.5px, цвет `rgba(243,231,220,0.10–0.16)`. Чисто-белые `rgba(255,255,255,…)` в новых стилях не использовать
- Цифры, цены, итоги: `var(--font-display)`, `font-style: italic`
- Лейблы секций: 10px / letter-spacing 2px / uppercase / `$muted`
- Выбранный элемент: фон `$field-bg` + красная точка-радио 13px. **Красной обводкой выделять запрещено**
- Невыбранный элемент: прозрачный фон, `opacity: 0.55`, кружок-радио с бордером
- Статусы — «штампы»: бордер 1.5px, паддинг 3px 9px, radius 6px, `rotate(2–8deg)`, у соседних штампов углы разные
- Иконки: `@tabler/icons-react`, stroke 1.5. **Эмодзи в UI запрещены** — при встрече заменять на иконку
- Декоративный штрихкод: ряд div шириной 2–7px, высота 14–26px, цвет `$cream` (или `$paper-ink` на бумаге), `aria-hidden="true"`
- Перфорация билета: `2px dashed rgba(243,231,220,0.25–0.3)` + круглые «вырезы» цвета подложки по краям, всё `aria-hidden`

### Что не менять при редизайне

- Логику: `useState`/`useEffect`, хендлеры, Firebase-сервисы, `emailService`, `loyaltyService`
- i18n: тексты только через `t.*` и ветки `lang === 'FR'`; новые строки — в оба языка
- Шаг `auth` в `BookingModal`
- Адаптив: новые стили обязаны иметь ветки `@include mixins.mobile` / `mixins.small`
- Плейсхолдеры из референсов (`[ афиша ]`, зелёные блоки, фейковый QR, SVG-карта) заменяются реальными компонентами, а не копируются как есть
