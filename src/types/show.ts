import type { MonthKey, ShowTagKey } from '../i18n/types';

export type ShowPhoto = {
  src: string;
  position?: string;    // object-position на фото, например "center 35%"
  mobileScale?: number; // масштаб на мобиле: 1.2 = +20%, 1.4 = +40% (desktop игнорирует)
  size?: string;        // устаревшее, оставлено для совместимости — не используется
};

export interface TicketType {
  id: 'standard' | 'student';
  label: string;
  price: number;
  available: number;
}

export interface Show {
  id: string;
  title: string;
  titleFR?: string;
  author: string;
  authorFR?: string;
  date: string;
  day: string;
  // MonthKey, а не string: иначе пропуск месяца в словаре перевода
  // компилятор не заметит и во французской версии появится «Окт».
  month: MonthKey;
  time: string;
  year: string;
  age: string;
  price: string;
  priceFR?: string;
  duration: string;
  durationFR?: string;
  desc: string;
  descFR: string;
  palette: string;
  image?: string;
  imagePosition?: string;
  photos?: Array<string | ShowPhoto>;
  ticketTypes: TicketType[];
  totalSeats: number;
}

// Заготовка сезона: дата с афиши уже зафиксирована, а материалов (постера,
// фотографий, описания, цен) ещё нет. Такой спектакль нигде не рендерится —
// он существует только чтобы дата жила в коде ровно в одном месте и совпадала
// с серверным каталогом. Когда материалы придут, заготовка превращается в Show.
export interface DraftShow {
  id: string;
  title: string;
  titleFR: string;
  // Подзаголовок с афиши: автор или жанр («Кукольный спектакль»).
  subtitle: string;
  subtitleFR: string;
  day: string;
  month: MonthKey;
  time: string;
  year: string;
  // Всегда false: опубликованный спектакль описывается типом Show.
  published: false;
}

export interface RepertoireItem {
  id: string;
  status: 'active' | 'past';
  title: string;
  titleFR?: string;
  author: string;
  authorFR?: string;
  // ShowTagKey, а не string: тот же класс ошибки, что и с месяцами.
  tag: ShowTagKey;
  age: string;
  palette: string;
  image?: string;
  imagePosition?: string;
  description?: string;
  descriptionFR?: string;
  duration?: string;
  durationFR?: string;
}
