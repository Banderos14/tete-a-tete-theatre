// Подключение Google Analytics 4 по согласию.
//
// GA4 ставит cookie, поэтому во Франции (GDPR, рекомендации CNIL) он не должен
// стартовать до явного согласия. Раньше gtag.js подключался прямо в index.html
// и запускался у каждого посетителя.
//
// Здесь: скрипт грузится ТОЛЬКО после accept, а отказ реально означает, что он
// не загружается вовсе. Vercel Analytics и Speed Insights не затрагиваются —
// они работают без cookie.

type ConsentValue = 'granted' | 'denied';

const STORAGE_KEY = 'cookie-consent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: any[]) => void };

export function readStoredConsent(): ConsentValue | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    // Приватный режим / заблокированное хранилище — считаем, что выбора не было.
    return null;
  }
}

export function storeConsent(value: ConsentValue): void {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* не критично */ }
}

function getMeasurementId(): string | null {
  const meta = document.querySelector('meta[name="ga-measurement-id"]');
  const id = meta?.getAttribute('content')?.trim();
  return id ? id : null;
}

let loaded = false;

// Идемпотентно: повторные вызовы не подключают скрипт второй раз.
export function loadAnalytics(): void {
  if (loaded) return;
  const measurementId = getMeasurementId();
  if (!measurementId) return;
  loaded = true;

  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w.gtag = function gtag(...args: any[]) { w.dataLayer!.push(args); };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  w.gtag('js', new Date());
  w.gtag('config', measurementId);
}

// Применяет сохранённый выбор при загрузке страницы.
export function applyStoredConsent(): void {
  if (readStoredConsent() === 'granted') loadAnalytics();
}
