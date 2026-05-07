export interface FontPair {
  display: string;
  body: string;
  label: string;
}

export const FONT_PAIRS: Record<string, FontPair> = {
  cormorant: { display: "'Cormorant Garamond', serif", body: "'Inter', sans-serif", label: 'Cormorant + Inter' },
};

export interface BgTone {
  bg: string;
  bg2: string;
  bg3: string;
}

export const BG_TONES: Record<string, BgTone> = {
  'warm-black': { bg: '#0a0908', bg2: '#14100e', bg3: '#1c1714' },
  'bordeaux':   { bg: '#0e0608', bg2: '#1a0a0e', bg3: '#250e14' },
  'midnight':   { bg: '#080a0e', bg2: '#0e1218', bg3: '#141822' },
};
