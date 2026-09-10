import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './styles/globals.scss';
import App from './App.tsx';
import { ErrorBoundary, RootErrorScreen } from './components/ui/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="root" fallback={<RootErrorScreen />}>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
);
