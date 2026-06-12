export interface TicketType {
  id: 'standard' | 'student';
  label: string;
  price: number; // EUR
  available: number; // remaining seats
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
  href: string;
  palette: string;
  glyph: string;
  image?: string;
  photos?: string[];
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
  glyph: string;
  palette: string;
  image?: string;
  description?: string;
  descriptionFR?: string;
  duration?: string;
  durationFR?: string;
}
