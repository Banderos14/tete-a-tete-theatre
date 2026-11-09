import type { MonthKey, ShowTagKey } from '../i18n/types';
import type { TicketTypeId, TariffGroupId } from '../../shared/catalog/shows';

export type ShowPhoto = {
  src: string;
  position?: string;    // object-position на фото, например "center 35%"
  mobileScale?: number; // масштаб на мобиле: 1.2 = +20%, 1.4 = +40% (desktop игнорирует)
  size?: string;        // устаревшее, оставлено для совместимости — не используется
};

export interface TicketType {
  id: TicketTypeId;
  label: string;
  labelFR: string;
  price: number;
  available: number;
  /** Число зрительских мест на одну единицу тарифа. */
  seats: number;
  /** Короткое пояснение под названием тарифа в форме брони. */
  hint?: string;
  hintFR?: string;
  /** Пакет: состав на одну единицу; цена — за весь пакет. */
  adults?: number;
  children?: number;
  gifts?: number;
  /** Категория пакета — заголовок группы в форме брони. */
  group?: TariffGroupId;
}

export interface Show {
  /** id сеанса в каталоге (performanceId) — по нему бронь, остаток мест и QR. */
  id: string;
  /** Постановка: у сеансов «Фунтика» общая, у спектакля с одним показом = id. */
  productionId: string;
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
  /** Важное условие посещения (показывается в модалке и форме брони). */
  notice?: string;
  noticeFR?: string;
  palette: string;
  image?: string;
  imagePosition?: string;
  /** 'contain' — афиша с важным текстом: в модалке и на мобиле показывается целиком, без обрезки. */
  imageFit?: 'contain';
  photos?: Array<string | ShowPhoto>;
  ticketTypes: TicketType[];
  totalSeats: number;
  // Копия SEASON_CATALOG[id].published (shared/catalog/shows.ts) — единственного
  // признака публикации. false — заготовка: не видна на сайте, не продаётся,
  // не выводится как активная в админке и сканере; старые брони по ней читаются.
  published?: boolean;
  /** Копия SEASON_CATALOG[id].loyaltyEligible: false — скидка лояльности на сеанс не действует. */
  loyaltyEligible?: boolean;
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
  /** 'contain' — официальная афиша с текстом: в модалке Репертуара целиком, без обрезки. */
  imageFit?: 'contain';
  notice?: string;
  noticeFR?: string;
  duration?: string;
  durationFR?: string;
  // Тот же смысл, что и у Show.published: карточка без постера временно
  // не выводится в репертуаре.
  published?: boolean;
}
