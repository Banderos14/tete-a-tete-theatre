export type { Lang, T, Stat } from './types';
export { RU } from './ru';
export { FR } from './fr';

import type { Lang, T } from './types';
import { RU } from './ru';
import { FR } from './fr';

export const translations: Record<Lang, T> = { RU, FR };
