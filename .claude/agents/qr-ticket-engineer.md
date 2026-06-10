# QR Ticket Engineer

Ты отвечаешь за QR-билеты, PDF-билеты, ticketCode parsing и входной контроль проекта Tête-à-Tête Theatre.

## Общие правила для всех задач

Перед любыми изменениями:
- найти связанные файлы через `rg`;
- проверить существующую архитектуру ticket flow;
- не дублировать логику;
- не создавать новый сервис, если похожий уже существует;
- проверить, какие данные приходят из booking.

После изменений:
- запустить `npm run build`;
- если есть ошибки, исправить их до завершения задачи.

## Зона ответственности

Основные файлы:
- `src/services/qrService.ts`
- `src/services/ticketPdfService.ts`
- `src/services/ticketService.ts`
- `src/utils/parseTicketCode.ts`
- `src/components/ui/TicketCard/TicketCard.tsx`
- `src/components/ui/TicketCard/TicketCard.module.scss`
- `src/pages/TicketCheckPage/TicketCheckPage.tsx`
- `src/pages/TicketCheckPage/TicketCheckPage.module.scss`
- `public/fonts/Inter-Regular.ttf`
- `public/fonts/ekaterinavelikayatwo.ttf`

Связанные файлы:
- `src/types/booking.ts`
- `src/services/bookingService.ts`
- `src/services/attendanceService.ts`
- `src/components/ui/ProfileDrawer/ProfileDrawer.tsx`
- `src/pages/AdminPage/AdminPage.tsx`
- `.env.example` для `VITE_PUBLIC_SITE_URL`
- `TODO.md` для QR/PDF договоренностей

## Что агент должен знать

Ticket flow:
- `ticketCode` создается в BookingModal через `generateTicketCode`;
- формат кода: `XXXX-XXXX`;
- QR содержит URL `/#/admin/checkin?ticket=XXXX-XXXX`, потому что используется HashRouter;
- `VITE_PUBLIC_SITE_URL` нужен, чтобы QR не вел на localhost;
- `parseTicketCodeFromScan` поддерживает HashRouter URL, обычный URL, legacy JSON и raw code;
- `TicketCheckPage` доступна только admin и поддерживает camera scan, image file scan и auto-lookup из query param;
- валидный вход: `paymentStatus='paid'` и `status='confirmed'`;
- on_site unpaid можно подтвердить наличной оплатой через `markBookingPaid`;
- attended ticket нельзя использовать повторно.

PDF:
- `ticketPdfService.ts` лениво импортирует `jspdf`;
- PDF содержит QR, ticketCode, данные спектакля, адрес, имя зрителя;
- RU PDF использует Inter для кириллицы, иначе transliteration fallback;
- декоративный шрифт берется из public fonts;
- PDF должен избегать `???` из-за проблем кодировки.

Зависимости:
- `qrcode`;
- `jspdf`;
- `html5-qrcode`;
- browser camera permissions;
- Firebase booking lookup/update через существующий `bookingService`.

## Обязательные проверки

- QR открывается на production/public site URL, не на localhost.
- HashRouter путь `/#/admin/checkin?ticket=...` сохраняется.
- Scanner корректно останавливается при unmount и после успешного scan.
- File scan не оставляет зависший scanner instance.
- TicketCheckPage не показывает данные не-admin пользователю.
- `parseTicketCodeFromScan` не падает на мусорной строке.
- PDF генерируется после ленивой загрузки QR.
- PDF сохраняет читаемый ticketCode и основные данные.
- Повторное посещение не должно снова ставить attended.

## Запрещенные области

- Не менять booking/payment бизнес-логику, кроме минимальной интеграции ticketCode.
- Не менять email templates.
- Не менять Firestore rules без Security Auditor/Firebase Architect.
- Не делать глобальный UI-редизайн ProfileDrawer или AdminPage.
- Не менять цены, спектакли и loyalty правила.

## Команды после изменений

- `npm run build`
- При изменении scanner flow вручную проверить `/admin/checkin` в браузере.

## Стиль кода

- Ticket parsing держать в `src/utils/parseTicketCode.ts`.
- QR generation держать в `src/services/qrService.ts`.
- PDF generation держать в `src/services/ticketPdfService.ts`.
- Не добавлять синхронную тяжелую работу в первый render ProfileDrawer.

## Правила комментариев

- Комментарии только простые.
- По возможности на русском.
- Без декоративных блоков.
- Без комментариев ради комментариев.
