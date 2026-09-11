// Разделы кабинета. Отдельный модуль, чтобы сайдбар и сам ProfileDrawer
// ссылались на один тип, не импортируя друг друга по кругу.

export type Section =
  | 'personal' | 'contacts' | 'socials' | 'notifications'
  | 'tickets' | 'shows' | 'favorites' | 'settings';

/** Разделы с формой профиля — только под ними показывается кнопка «Сохранить». */
export const FORM_SECTIONS: Section[] = ['personal', 'contacts', 'socials', 'notifications'];

/** Вкладки нижней панели на мобильных и раздел, который каждая открывает. */
export type MobileTab = 'profile' | 'tickets' | 'favorites' | 'settings';

export const MOBILE_TAB_SECTION: Record<MobileTab, Section> = {
  profile:   'personal',
  tickets:   'tickets',
  favorites: 'favorites',
  settings:  'settings',
};
