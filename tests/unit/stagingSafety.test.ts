// Staging не должен касаться production: ни базы, ни писем реальным зрителям,
// ни live-денег.
//
// Признак production — только VERCEL_ENV=production (его ставит сам Vercel).
// Юнит-тесты по умолчанию работают как production (vitest.config.ts), поэтому
// staging здесь включается явно: vi.stubEnv('VERCEL_ENV', 'preview').

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryFirestore } from '../helpers/memoryFirestore';

const initializeApp = vi.fn(() => ({ name: 'app' }));
vi.mock('firebase-admin/app', () => ({
  initializeApp,
  getApps: () => [],
  cert:    (sa: unknown) => sa,
}));

let store = new MemoryFirestore();
vi.mock('firebase-admin/firestore', () => ({
  FieldValue:   { serverTimestamp: () => '<ts>' },
  getFirestore: () => store,
}));
vi.mock('../../server/booking/booking.repository.js', () => ({
  db:       () => store,
  BOOKINGS: 'bookings',
}));
vi.mock('../../server/email/email.repository.js', () => ({
  logEmailDelivery:   async () => {},
  logEmailDeliveries: async () => {},
}));
vi.mock('../../server/email/newsletter.recipients.js', () => ({
  loadNewsletterRecipients: async () => [
    { uid: 'u1', email: 'real1@example.com', name: 'Anna', lang: 'RU' },
    { uid: 'u2', email: 'real2@example.com', name: 'Paul', lang: 'FR' },
    { uid: 'u3', email: 'real3@example.com', name: 'Olga', lang: 'RU' },
  ],
}));

const { isProductionRuntime, assertFirebaseProjectAllowed, PRODUCTION_FIREBASE_PROJECT_ID } =
  await import('../../server/shared/runtimeEnv.js');
const { getAdminApp }  = await import('../../server/shared/firebaseAdmin.js');
const { routeEmail }   = await import('../../server/email/recipient.js');
const { sendBookingEmail } = await import('../../server/email/ticketEmail.service.js');
const { createResendBatchSender, defaultNewsletterDeps } = await import('../../server/email/newsletter.service.js');
const { stripeKeyMode, resolveStripeSecretKey, isOnlinePaymentEnabled, getStripe, expectedLivemode } =
  await import('../../server/payments/stripe.client.js');
const { ApiError } = await import('../../server/shared/errors.js');

const TEST_INBOX = 'qa-inbox@example.com';

function serviceAccount(projectId: string): string {
  return JSON.stringify({
    project_id: projectId, client_email: `sa@${projectId}.iam.gserviceaccount.com`,
    private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
  });
}

beforeEach(() => {
  store = new MemoryFirestore();
  initializeApp.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('признак production', () => {
  it('production — только VERCEL_ENV=production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isProductionRuntime()).toBe(true);
    for (const env of ['preview', 'development', '']) {
      vi.stubEnv('VERCEL_ENV', env);
      expect(isProductionRuntime(), env).toBe(false);
    }
  });

  it('APP_ENV=production без VERCEL_ENV production не делает', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('APP_ENV', 'production');
    expect(isProductionRuntime()).toBe(false);
  });
});

describe('staging не подключается к production Firebase', () => {
  it('вне production production-проект запрещён', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(() => assertFirebaseProjectAllowed(PRODUCTION_FIREBASE_PROJECT_ID)).toThrow(/production Firebase/);
    expect(() => assertFirebaseProjectAllowed('theatre-tete-a-tete-staging')).not.toThrow();
  });

  it('getAdminApp отказывает ДО initializeApp, если staging получил prod service account', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', serviceAccount('theatre-tete-a-tete'));
    expect(() => getAdminApp()).toThrow(/production Firebase/);
    expect(initializeApp).not.toHaveBeenCalled();
  });

  it('staging-проект на staging подключается', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', serviceAccount('theatre-tete-a-tete-staging'));
    getAdminApp();
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });

  it('production по-прежнему подключается к production-проекту', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', serviceAccount('theatre-tete-a-tete'));
    getAdminApp();
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });

  it('`vercel dev` (development) тоже не подключается к production', () => {
    vi.stubEnv('VERCEL_ENV', 'development');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', serviceAccount('theatre-tete-a-tete'));
    expect(() => getAdminApp()).toThrow();
  });
});

describe('маршрутизация писем', () => {
  const mail = { to: 'viewer@example.com', subject: 'Билет', html: '<html><body><p>QR</p></body></html>', text: 'QR' };

  it('production: письмо уходит адресату без изменений', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', TEST_INBOX);
    expect(routeEmail(mail)).toEqual({ kind: 'send', email: mail });
  });

  it('staging: письмо уходит только на TEST_EMAIL_RECIPIENT, исходный адресат виден', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', TEST_INBOX);
    const r = routeEmail(mail);
    expect(r.kind).toBe('send');
    if (r.kind !== 'send') return;
    expect(r.email.to).toBe(TEST_INBOX);
    expect(r.email.subject).toBe('[STAGING → viewer@example.com] Билет');
    expect(r.email.html).toContain('Предполагаемый получатель: <strong>viewer@example.com</strong>');
    expect(r.email.html.indexOf('Предполагаемый')).toBeGreaterThan(r.email.html.indexOf('<body>'));
    expect(r.email.text).toContain('viewer@example.com');
    expect(r.redirectedFrom).toBe('viewer@example.com');
  });

  it('staging без TEST_EMAIL_RECIPIENT — письмо не отправляется (fail closed)', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', '');
    expect(routeEmail(mail)).toEqual({ kind: 'blocked', reason: 'staging_no_test_recipient' });
    vi.stubEnv('TEST_EMAIL_RECIPIENT', 'not-an-address');
    expect(routeEmail(mail).kind).toBe('blocked');
  });

  it('исходный адрес в баннере экранируется', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', TEST_INBOX);
    const r = routeEmail({ ...mail, to: '<script>@x.io' });
    expect(r.kind === 'send' && r.email.html).not.toContain('<script>');
  });
});

describe('письмо-билет на staging', () => {
  const sent: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    sent.length = 0;
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'Theatre <tickets@example.com>');
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response('{}', { status: 200 });
    }));
    store.seed('bookings', 'b1', {
      userId: 'u1', userEmail: 'real-viewer@example.com', userName: 'Anna', showId: 'shutka',
      showTitle: 'Шутка', showDate: '02 Окт 2026', showTime: '20:00', ticketsCount: 1, ticketType: 'standard',
      totalAmount: 30, ticketCode: 'ABCD-2345', status: 'confirmed', paymentMethod: 'online',
      paymentStatus: 'paid', lang: 'RU',
    });
  });

  it('уходит на тестовый адрес, а не зрителю', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', TEST_INBOX);
    const out = await sendBookingEmail('b1', 'paid');
    expect(out.status).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(TEST_INBOX);
    expect(String(sent[0]!.subject)).toMatch(/^\[STAGING → real-viewer@example\.com\] /);
    expect(JSON.stringify(sent)).not.toContain('"to":"real-viewer@example.com"');
  });

  it('без TEST_EMAIL_RECIPIENT не уходит никому', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', '');
    const out = await sendBookingEmail('b1', 'paid');
    expect(out).toEqual({ status: 'skipped', reason: 'staging_no_test_recipient' });
    expect(sent).toHaveLength(0);
  });

  it('в production уходит зрителю', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    await sendBookingEmail('b1', 'paid');
    expect(sent[0]!.to).toBe('real-viewer@example.com');
  });
});

describe('рассылка на staging', () => {
  const email = (to: string) => ({ from: 'f@example.com', to, subject: 'Анонс', html: '<p>x</p>', text: 'x' });

  it('пачка уходит только на тестовый адрес', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', TEST_INBOX);
    const fetchImpl = vi.fn(async () => new Response('{"data":[]}', { status: 200 }));
    const send = createResendBatchSender('re_test', fetchImpl as unknown as typeof fetch);
    const out = await send([email('real1@example.com')]);
    expect(out.ok).toBe(true);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body) as Array<{ to: string; subject: string }>;
    expect(body.map(e => e.to)).toEqual([TEST_INBOX]);
    expect(body[0]!.subject).toContain('real1@example.com');
  });

  it('без TEST_EMAIL_RECIPIENT Resend не вызывается', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', '');
    const fetchImpl = vi.fn();
    const out = await createResendBatchSender('re_test', fetchImpl as unknown as typeof fetch)([email('real1@example.com')]);
    expect(out.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('на staging рассылка — одно письмо, а не копия на каждого зрителя', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(await defaultNewsletterDeps().loadRecipients()).toHaveLength(1);
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(await defaultNewsletterDeps().loadRecipients()).toHaveLength(3);
  });

  it('в production адресаты не меняются', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const fetchImpl = vi.fn(async () => new Response('{"data":[]}', { status: 200 }));
    await createResendBatchSender('re_test', fetchImpl as unknown as typeof fetch)([email('real1@example.com')]);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body) as Array<{ to: string }>;
    expect(body[0]!.to).toBe('real1@example.com');
  });
});

describe('ключи Stripe', () => {
  it('режим ключа по префиксу', () => {
    expect(stripeKeyMode('sk_test_123')).toBe('test');
    expect(stripeKeyMode('rk_test_123')).toBe('test');
    expect(stripeKeyMode('sk_live_123')).toBe('live');
    expect(stripeKeyMode('pk_test_123')).toBeNull();
    expect(stripeKeyMode(undefined)).toBeNull();
  });

  it('live-ключ вне production запрещён', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_abc');
    expect(() => resolveStripeSecretKey()).toThrow(/live key/);
    vi.stubEnv('ONLINE_PAYMENT_ENABLED', 'true');
    expect(isOnlinePaymentEnabled()).toBe(false);
  });

  it('test-ключ на staging разрешён, livemode событий ожидается false', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_abc');
    expect(resolveStripeSecretKey()).toBe('sk_test_abc');
    expect(expectedLivemode()).toBe(false);
  });

  it('приём оплаты — только при ONLINE_PAYMENT_ENABLED=true и ключе', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_abc');
    vi.stubEnv('ONLINE_PAYMENT_ENABLED', '');
    expect(isOnlinePaymentEnabled()).toBe(false);
    vi.stubEnv('ONLINE_PAYMENT_ENABLED', 'true');
    expect(isOnlinePaymentEnabled()).toBe(true);
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect(isOnlinePaymentEnabled()).toBe(false);
  });

  it('без ключа клиент Stripe не создаётся — 503', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    try {
      getStripe();
      throw new Error('ожидался отказ');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).status).toBe(503);
    }
  });
});
