# Tête-à-Tête Theatre — Website

Landing page for **Tête-à-Tête**, an independent Russian theatre in Nice, France.  
Built with **Vite + React 19 + TypeScript + SCSS Modules**.

---

## What this project is

This is a single-page website for the theatre. It shows the upcoming shows (afisha), the full repertoire, information about the team, partners, and how to find the theatre. The site supports two languages — Russian and French — and the user can switch between them in the header.

---

## Tech stack

| Tool | Why |
|---|---|
| **Vite 8** | Fast development server and build tool |
| **React 19** | UI components |
| **TypeScript 6** | Type safety across all files |
| **SCSS Modules** | Scoped styles per component, no conflicts |
| **Google Fonts** | Cormorant Garamond (display) + Inter (body) |

No UI libraries. No state management libraries. Everything is written from scratch.

---

## Project structure

```
src/
├── components/          # One folder per component
│   ├── Header/          #   Header.tsx + Header.module.scss + index.ts
│   ├── Hero/
│   ├── Afisha/          #   ShowCard.tsx lives here too
│   ├── Repertoire/
│   ├── About/
│   ├── Socials/
│   ├── Team/
│   ├── Partners/
│   ├── Contacts/
│   ├── Footer/
│   ├── Marquee/
│   ├── CurtainIntro/    #   Opening curtain animation
│   └── ui/
│       └── PosterPlaceholder/
├── data/                # Static data (shows, team, partners)
├── types/               # TypeScript interfaces (Show, TeamMember, Partner)
├── constants/           # Links, addresses
├── i18n/                # Language system
│   ├── translations.ts  #   All text in RU and FR
│   └── LangContext.tsx  #   React Context + useLang() hook
└── styles/              # Global styles, CSS variables, mixins
```

---

## Language system (i18n)

The site has a built-in translation system using **React Context**. There are no third-party i18n libraries.

**How it works:**

1. All text lives in `src/i18n/translations.ts` as a plain object with two keys — `RU` and `FR`.
2. `App.tsx` holds the current language in state and wraps everything in `<LangContext.Provider>`.
3. Every component calls `const { t, lang } = useLang()` to get the translations for the current language.

```ts
// translations.ts (simplified)
export type Lang = 'RU' | 'FR';

export const translations: Record<Lang, T> = {
  RU: { hero: { sub: 'Русский театр в Ницце', ... }, ... },
  FR: { hero: { sub: 'Théâtre russe à Nice', ... }, ... },
};
```

```tsx
// Inside any component
const { t } = useLang();
return <h1>{t.hero.sub}</h1>;
```

Show descriptions are bilingual too — the `Show` type has both `desc` (Russian) and `descFR` (French) fields.

---

## Design system

Colors and fonts are defined as CSS custom properties in `src/styles/variables.scss`.

**Main accent color:** `#B80000` (deep red)

**Font stack:**
- Display headings — `Cormorant Garamond` (serif, italic style)
- Body text / UI — `Inter` (sans-serif)
- Code / mono fallback — system `ui-monospace`

The site uses a **dark theme by default** with a light theme that activates when the user's OS is set to light mode (`prefers-color-scheme: light`).

---

## Animations

**Curtain intro** — on first load, a curtain opens like a stage reveal. It is controlled by React state: `'closed' → 'opening' → 'done'`. When done, it unmounts from the DOM completely.

**Scroll reveal** — elements get a `.reveal` class in JSX. An `IntersectionObserver` in `App.tsx` watches for them and adds `.visible` when they enter the viewport. CSS handles the fade-in transition.

---

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

**Build for production:**

```bash
npm run build
```

Output goes to `dist/`. The build runs TypeScript type-checking first (`tsc -b`), then Vite bundles everything.

---

## Key files to know

| File | What it does |
|---|---|
| [src/i18n/translations.ts](src/i18n/translations.ts) | All site text in RU and FR |
| [src/data/shows.ts](src/data/shows.ts) | Upcoming shows and full repertoire |
| [src/data/team.ts](src/data/team.ts) | Team members |
| [src/styles/variables.scss](src/styles/variables.scss) | Colors, fonts, spacing tokens |
| [src/App.tsx](src/App.tsx) | Root component, language state, scroll reveal |
| [index.html](index.html) | Google Fonts, meta tags, favicon |
