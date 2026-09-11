// Параметры вступительной анимации.
//
// На мобильных занавес не играем: он съедает первые секунды на медленной сети,
// а прокрутка всё равно блокируется на время анимации.

export const IS_MOBILE = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;

export const INTRO_SPEED = IS_MOBILE ? 0 : 2.2;
