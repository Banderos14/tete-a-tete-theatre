import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Handler проверяется целиком: настоящий requireAdmin заменён отказом 403,
// сервисы — шпионами. Если право проверяется не первым, шпион это покажет.

const preflight = vi.fn();
const send      = vi.fn();

vi.mock('../../server/shared/auth.js', async () => {
  const { forbidden } = await import('../../server/shared/errors.js');
  return {
    requireAdmin: vi.fn(async () => { throw forbidden('Newsletter is admin-only'); }),
  };
});

vi.mock('../../server/email/newsletter.service.js', () => ({
  newsletterPreflight:        (...args: unknown[]) => preflight(...args),
  sendNewsletter:             (...args: unknown[]) => send(...args),
  validateNewsletterRequest:  (body: unknown) => body,
}));

const { default: handler } = await import('../../api/newsletter.js');

function fakeReq(method: string, body = '{}'): IncomingMessage {
  const listeners: Record<string, ((chunk?: unknown) => void)[]> = {};
  const req = {
    method,
    headers: { authorization: 'Bearer user-token', origin: 'https://www.theatre-teteatete.fr' },
    on(event: string, cb: (chunk?: unknown) => void) {
      (listeners[event] ??= []).push(cb);
      if (event === 'end') queueMicrotask(() => { listeners.data?.forEach(f => f(body)); cb(); });
      return req;
    },
    destroy() {},
  };
  return req as unknown as IncomingMessage;
}

function fakeRes() {
  const res = {
    status: 0, body: '',
    writeHead(status: number) { res.status = status; return res; },
    end(chunk?: string) { res.body = chunk ?? ''; },
  };
  return res;
}

describe('/api/newsletter: только администратор', () => {
  beforeEach(() => { preflight.mockReset(); send.mockReset(); });

  it('preflight обычного пользователя → 403, счётчики не считаются', async () => {
    const res = fakeRes();
    await handler(fakeReq('GET'), res as unknown as ServerResponse);
    expect(res.status).toBe(403);
    expect(res.body).not.toMatch(/recipients|sentToday|remaining/);
    expect(preflight).not.toHaveBeenCalled();
  });

  it('отправка обычным пользователем → 403, ни одного письма', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', JSON.stringify({ showId: 'romantika', drafts: {} })), res as unknown as ServerResponse);
    expect(res.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it('другие методы → 405', async () => {
    const res = fakeRes();
    await handler(fakeReq('DELETE'), res as unknown as ServerResponse);
    expect(res.status).toBe(405);
  });
});
