// Compatibility re-export — все импорты из этого файла продолжают работать.
// Структура переводов:
//   src/i18n/types.ts   — интерфейсы T, Lang, Stat
//   src/i18n/ru.ts      — русский перевод
//   src/i18n/fr.ts      — французский перевод
//   src/i18n/index.ts   — точка сборки

export type { Lang, T, Stat } from './index';
export { translations } from './index';
