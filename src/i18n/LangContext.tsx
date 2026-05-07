import { createContext, useContext } from 'react';
import type { Lang, T } from './translations';
import { translations } from './translations';

interface LangContextValue {
  lang: Lang;
  t: T;
}

export const LangContext = createContext<LangContextValue>({
  lang: 'RU',
  t: translations.RU,
});

export function useLang() {
  return useContext(LangContext);
}
