# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Проект русскоязычный: комментарии в коде, доки и UI-тексты пишутся по-русски (UI — ещё и по-французски через i18n).

## Команды

```bash
npm run dev      # Vite dev server на порту 5174 (host: true — доступен по LAN)
npm run build    # tsc -b && vite build — обязательная проверка после любой задачи
npm run lint     # eslint .
npm run preview  # предпросмотр собранного dist
```

- **Тестов нет.** Test-раннер не настроен; регрессии ловятся `npm run build` (TypeScript) + ручной прогон чеклиста в `AUTH_TESTING.md` после изменений в авторизации, бронировании или письмах.
- **`/api/*` не работает под `npm run dev`.** Vite не поднимает serverless-функции. Для работы с `api/create-booking`, `api/send-email`, `api/delete-user` запускай `vercel dev` (нужен `vercel link` и заполненный `.env`).
- Правила Firestore деплоятся отдельно: `npx -y firebase-tools@latest deploy --only firestore:rules`.

## Архитектура

Vite + React 19 + TypeScript, SCSS-модули, без UI-библиотек. Firebase (Auth + Firestore) на клиенте, Vercel Serverless Functions (`api/`) для всего, что нельзя доверить браузеру.

### Роутинг и структура приложения

`main.tsx` оборачивает всё в **HashRouter** — это принципиально: все внешние ссылки, QR-коды и deep-links строятся в формате `/#/...` (см. `src/services/qrService.ts`, `src/utils/showUrl.ts`). Обычный path-роутинг сломает прямые переходы.

`App.tsx` держит глобальный стейт (тема, язык, открытые модалки) и три роута: `/` (лендинг), `/admin`, `/admin/checkin`. Модалки (`AuthModal`, `ProfileDrawer`, `BookingModal`) вынесены **за пределы `<Routes>`** и лениво грузятся — чтобы не пересоздаваться при навигации. Их чанки префетчатся в `requestIdleCallback` после завершения интро.

Firebase грузится лениво из `AuthContext` (`loadFirebase()` мемоизирует `import('../firebase/config')`) — firebase-чанк вынесен в `manualChunks` и не блокирует первый рендер.

### Бронирование — критичный поток

Клиент **не может** создать бронь напрямую: в `firestore.rules` для `bookings` стоит `allow create: if false`. Весь поток:

1. `BookingModal` собирает только `showId, ticketType, ticketsCount, paymentMethod, comment, phone, lang`.
2. `createBookingViaApi()` (`src/services/bookingService.ts`) шлёт это в `/api/create-booking` с `Authorization: Bearer <Firebase ID token>`.
3. `api/create-booking.ts` через Admin SDK сам считает цену, скидку лояльности, `ticketCode`, `status`, `paymentStatus` — клиентские значения игнорируются.

**Цены и даты спектаклей продублированы в двух местах:** константа `SHOWS` в `api/create-booking.ts` (сервер, source of truth) и `src/data/shows.ts` (фронт). При изменении расписания или цен нужно править **оба** файла, иначе сервер отклонит бронь или посчитает не ту сумму.

Пользователь может обновить бронь только одним способом — «протухание» ожидания перевода (`awaiting_transfer → expired`), и правила Firestore проверяют это по `affectedKeys()`.

### Роль admin

`userProfile.role` живёт в `users/{uid}`. Правила Firestore запрещают клиенту менять своё `role` (проверка `request.resource.data.role == resource.data.role` на update и `== 'user'` на create). `AdminPage` — это только UI-гейт; настоящая проверка на сервере: `isAdminToken()` в `api/send-email.ts` и `api/delete-user.ts` резолвит роль из Firestore по ID-токену.

`api/send-email.ts` фильтрует запросы по whitelist `ALLOWED_TYPES`; `newsletter`, `booking-status`, `payment-paid` требуют admin-токен, `booking-confirmation` — токен, чей email совпадает с получателем.

### Билеты и посещения

- `ticketService.generateTicketCode()` — формат `XXXX-XXXX`, алфавит без похожих символов (`0/O`, `1/I/L`), `crypto.getRandomValues`.
- QR ведёт на `/#/admin/checkin?ticket=CODE`; `parseTicketCodeFromScan()` разбирает hash-URL, обычный URL, легаси-JSON и голый код.
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

Секреты (`RESEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `ALLOWED_ORIGIN`) — **без префикса `VITE_`**, иначе они попадут в бандл. Описание всех переменных — в `.env.example`.

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
