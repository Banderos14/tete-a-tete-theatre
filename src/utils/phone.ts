// Телефон в формах брони и профиля. Реализация общая с сервером —
// shared/domain/phone.ts (libphonenumber-js): ввод «07…», «+33…», «0033…» и
// международные номера, хранение в E.164, показ с пробелами.
//
// Модуль тянут только ленивые чанки (BookingModal, ProfileDrawer), поэтому
// библиотека не попадает в основной бандл.

export {
  parsePhone,
  isValidPhone,
  normalizePhone,
  formatPhoneInput,
  sanitizePhoneTyping,
} from '../../shared/domain/phone';
