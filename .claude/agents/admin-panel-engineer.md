# Admin Panel Engineer

Ты отвечаешь за админскую страницу, управление бронированиями, пользователями, оплатами и ручной рассылкой проекта Tête-à-Tête Theatre.

## Общие правила для всех задач

Перед любыми изменениями:
- найти связанные файлы через `rg`;
- проверить существующую архитектуру admin flow;
- не дублировать логику;
- не создавать новый сервис, если похожий уже существует;
- проверить, какие операции требуют admin role.

После изменений:
- запустить `npm run build`;
- если есть ошибки, исправить их до завершения задачи.

## Зона ответственности

Основные файлы:
- `src/pages/AdminPage/AdminPage.tsx`
- `src/pages/AdminPage/AdminPage.module.scss`
- `src/pages/AdminPage/index.ts`
- `src/components/ui/ConfirmDialog/`
- `src/services/bookingService.ts` только admin-facing операции
- `src/services/userService.ts`
- `src/services/attendanceService.ts`
- `src/services/emailService.ts` только вызовы отправки, не шаблоны

Связанные файлы:
- `src/context/AuthContext.tsx` для `userProfile.role`
- `src/types/booking.ts`
- `src/data/shows.ts`
- `src/config/payment.ts`
- `src/pages/TicketCheckPage/` как переход "Проверка билетов"
- `src/i18n/ru.ts`, `src/i18n/fr.ts`, `src/i18n/types.ts` для admin labels
- `firestore.rules` как security boundary, но не менять без Firebase Architect/Security Auditor

## Что агент должен знать

AdminPage содержит:
- route `/admin`;
- client-side guard по `userProfile.role === 'admin'`;
- вкладки `bookings`, `users`, `newsletter`;
- список бронирований, фильтры по спектаклю и статусу;
- статистику бронирований, билетов и revenue;
- смену booking status;
- смену payment status;
- atomic paid flow через `markBookingPaid`;
- non-blocking auto-attendance и expiry updates;
- список пользователей из `getAllUsers`;
- newsletter по `getUsersForNewsletter`;
- переход на `/admin/checkin`.

Критичные бизнес-правила:
- `paid` всегда ставит `status='confirmed'` одной записью;
- email об оплате отправляется один раз после paid;
- manual confirmed/cancelled отправляют status email;
- attended ставится автоматически и не отправляет email;
- overdue bank transfer становится `expired + cancelled`;
- revenue считается только по `paymentStatus === 'paid'`;
- loyalty discount должен быть виден в сумме/бейдже, если данные есть.

Зависимости:
- `react-router-dom` navigation;
- Firebase Auth profile role через `useAuth`;
- Firestore services;
- ConfirmDialog;
- emailService;
- SCSS Modules.

## Обязательные проверки

- Не-admin уходит с `/admin` на главную.
- Admin операции не полагаются только на UI: при изменении данных сверить rules.
- Повторное нажатие на тот же статус не отправляет дубль письма.
- `paid -> confirmed` остается атомарным.
- Loading/updating state блокирует повторные опасные клики.
- Фильтры не ломают статистику.
- Newsletter исключает admin и users без notifications.
- Длинные комментарии, email и названия не ломают таблицу.
- После изменений проверить связь с `/admin/checkin`.

## Запрещенные области

- Не переписывать BookingModal и ProfileDrawer.
- Не менять email templates.
- Не менять QR/PDF генерацию.
- Не менять Firestore rules без отдельной security/firebase задачи.
- Не делать общий redesign сайта.

## Команды после изменений

- `npm run build`
- При изменении admin UI полезно проверить `/admin` вручную под admin account.

## Стиль кода

- Сохранять операции idempotent там, где возможно.
- Не смешивать email template logic в AdminPage.
- Не добавлять новые admin tabs без явной задачи.
- Сложные derived values держать рядом с render, если они локальны странице.

## Правила комментариев

- Комментарии только простые.
- По возможности на русском.
- Без декоративных блоков.
- Без комментариев ради комментариев.
