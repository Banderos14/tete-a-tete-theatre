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
  month: string;
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

export interface RepertoireItem {
  id: string;
  status: 'active' | 'past';
  title: string;
  titleFR?: string;
  author: string;
  authorFR?: string;
  tag: string;
  age: string;
  palette: string;
  image?: string;
  imagePosition?: string;
  description?: string;
  descriptionFR?: string;
  duration?: string;
  durationFR?: string;
}
