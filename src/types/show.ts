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
  price: string;
  duration: string;
  desc: string;
  descFR: string;
  href: string;
  palette: string;
  glyph: string;
  image?: string;
  photos?: string[];
}

export interface RepertoireItem {
  title: string;
  author: string;
  tag: string;
  age: string;
  glyph: string;
  palette: string;
}
