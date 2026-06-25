import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Moves the Vite-injected <link rel="stylesheet"> to appear before
// the main <script type="module"> so the browser's preload scanner
// discovers the CSS bundle earlier and downloads it in parallel with JS.
function prioritizeCssPlugin(): Plugin {
  return {
    name: 'prioritize-css',
    transformIndexHtml: {
      order: 'post',
      handler(html: string): string {
        let cssTag = '';
        const withoutCss = html.replace(
          /\n?[ \t]*<link rel="stylesheet" crossorigin href="\/assets\/[^"]+\.css">/,
          (m) => { cssTag = m.trim(); return ''; },
        );
        if (!cssTag) return html;
        return withoutCss.replace(
          '<script type="module" crossorigin',
          `${cssTag}\n    <script type="module" crossorigin`,
        );
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), prioritizeCssPlugin()],
  base: '/',
  server: {
    port: 5174,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) {
            return 'firebase';
          }
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router')
          ) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
