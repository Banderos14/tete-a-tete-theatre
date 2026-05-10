# Tête-à-Tête Theatre — Website

Landing page for **Tête-à-Tête**, an independent Russian theatre in Nice, France.  
Built with **Vite + React 19 + TypeScript + SCSS Modules**.

---

## What this project is

A single-page website for the theatre. It shows upcoming shows, the full repertoire, team, partners, and contacts. The site supports two languages — Russian and French — switchable from the header.

---

## Tech stack

| Tool | Why |
|---|---|
| **Vite 8** | Fast dev server and build |
| **React 19** | UI components |
| **TypeScript 6** | Types across all files |
| **SCSS Modules** | Scoped styles per component |

No UI libraries. No state management libraries. Everything is written from scratch.

---

## Project structure

```
src/
├── components/
│   ├── Hero/
│   │   ├── Hero.tsx               # Hero section
│   │   ├── Hero.module.scss       # Styles + dark/light theme overrides
│   │   └── StageLight.ts          # Canvas spotlight animation
│   ├── Afisha/
│   │   ├── Afisha.tsx             # Afisha section wrapper
│   │   ├── AfishaSlider.tsx       # Fullscreen auto-scroll cards
│   │   └── AfishaSlider.module.scss
│   ├── CurtainIntro/              # Opening curtain animation
│   ├── Header/
│   ├── Marquee/
│   ├── Repertoire/
│   ├── About/
│   ├── Socials/
│   ├── Team/
│   ├── Partners/
│   ├── Contacts/
│   └── Footer/
├── data/                          # Static data — edit shows, team, partners here
├── types/                         # TypeScript interfaces
├── constants/                     # Links, addresses
├── i18n/
│   ├── translations.ts            # All text in RU and FR
│   └── LangContext.tsx            # useLang() hook
└── styles/                        # Global CSS, variables, mixins
```

---

## Language system (i18n)

All text is in `src/i18n/translations.ts` as one object with `RU` and `FR` keys. No external libraries.

```tsx
const { t } = useLang();
return <h1>{t.hero.sub}</h1>;
```

The hero title is stored as `{ before, letter, after }` — easy to edit per language without touching any component files.

---

## Adding or changing shows

Open `src/data/shows.ts`. Each show looks like this:

```ts
{
  id: 'shutka',
  title: '«И в шутку, и всерьёз»',
  author: 'А. П. Чехов · Две комедии',
  date: '22.05', day: '22', month: 'Май', time: '20:00', year: '2026',
  age: '12+', price: 'от 15 €', duration: '1 ч 10 мин',
  desc: '...',
  descFR: '...',
  href: 'https://...',
  palette: 'linear-gradient(...)',    // background color when there is no photo
  glyph: '❦',                         // decorative symbol on the card
  image: '/images/shows/shutka.jpg',  // optional photo
}
```

**To add a show photo:** put the file in `public/images/shows/` and set `image: '/images/shows/filename.jpg'`. If there is no image, the gradient shows instead — nothing breaks.

The afisha slider picks up all shows automatically. No other files to change.

---

## Hero section

The hero has a **canvas spotlight animation** (`StageLight.ts`). It draws 7 volumetric theatrical lights with red and warm-white beams, floor light pools, and floating dust particles.

The title accent letter **А / à** is styled with CSS classes — color, pulsing dots, and animation are all in `Hero.module.scss`. To change the letter style, edit that file.

**Light theme:** the canvas is hidden, a subtle red glow replaces it, and all colors adapt automatically via `[data-theme='light']` overrides in `Hero.module.scss`.

---

## Afisha slider

The afisha section shows a fullscreen auto-scrolling slider. Each card is `100vw` wide — one card fills the whole screen. Scroll speed scales with the number of shows (10 seconds per show), so adding or removing a show adjusts the speed automatically.

---

## Design system

Colors and fonts are in `src/styles/variables.scss`.

- **Accent:** `#B80000` (deep red)
- **Display font:** Cormorant Garamond (headings, italic style)
- **Body font:** Inter
- **Mono font:** system `ui-monospace`

Dark theme is the default. Light theme variables are in the same file under `[data-theme='light']`.

---

## Curtain intro

On first load a curtain opens from the center — two panels slide left and right. Speed is controlled by `INTRO_SPEED` in `App.tsx` (in seconds). The curtain component unmounts completely after the animation finishes.

---

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

```bash
npm run build   # production build → dist/
```

---

## Key files

| File | What to edit |
|---|---|
| `src/i18n/translations.ts` | All site text in RU and FR |
| `src/data/shows.ts` | Upcoming shows — add, remove, update |
| `src/data/team.ts` | Team members |
| `src/styles/variables.scss` | Colors, fonts |
| `src/App.tsx` | Theme state, language state, curtain speed |
| `public/images/shows/` | Show poster photos |
