export interface TicketType {
  id: 'standard' | 'student';
  label: string;
  price: number; // EUR
  available: number; // remaining seats
}

export interface Show {
  id: string;
  title: string;
  author: string;
  date: string;
  day: string;
  month: string;
  time: string;
  year: string;
  age: string;
  price: string; // display string, kept for ShowModal compat
  duration: string;
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
  title: string;
  author: string;
  tag: string;
  age: string;
  glyph: string;
  palette: string;
  description?: string;
  descriptionFR?: string;
  duration?: string;
}
