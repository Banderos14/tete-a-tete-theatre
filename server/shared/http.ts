// Общие HTTP-хелперы для всех serverless-функций: CORS, чтение тела, ответы.
// Живёт вне api/, потому что Vercel делает endpoint'ом каждый файл внутри api/.
// В endpoint'ы попадают только тонкие handler'ы, общий слой — здесь.

import type { IncomingMessage, ServerResponse } from 'node:http';

const DEFAULT_ORIGIN = 'https://www.theatre-teteatete.fr';

// Явный список разрешённых origin'ов. Wildcard не используется:
// запросы несут Authorization-заголовок, а значит требуют точного origin.
const ALLOWED_ORIGINS = new Set(
  [
    process.env.ALLOWED_ORIGIN,
    DEFAULT_ORIGIN,
    'https://tete-a-tete-theatre.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174', // порт vite-конфига проекта
    'http://localhost:4173',
    'http://localhost:3000',
  ].filter(Boolean) as string[],
);

function resolveCorsOrigin(req: IncomingMessage): string {
  const origin = String(req.headers['origin'] ?? '');
  return ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;
}

export function corsHeaders(req: IncomingMessage): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  resolveCorsOrigin(req),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary':                         'Origin',
  };
}

export function respond(
  res: ServerResponse,
  status: number,
  body: object,
  req?: IncomingMessage,
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...(req ? corsHeaders(req) : { 'Access-Control-Allow-Origin': DEFAULT_ORIGIN }),
  });
  res.end(JSON.stringify(body));
}

// Ограничение размера тела: защищает от попытки прислать мегабайты текста.
const MAX_BODY_BYTES = 64 * 1024;

export async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: unknown) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      total += buf.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Достаёт Firebase ID token из заголовка Authorization: Bearer <token>.
export function bearerToken(req: IncomingMessage): string | null {
  const raw = String(req.headers['authorization'] ?? '');
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() || null : null;
}
