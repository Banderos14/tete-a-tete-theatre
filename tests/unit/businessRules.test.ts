import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const r = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('протухание брони происходит надёжно, а не «когда кто-нибудь зайдёт»', () => {
  const cron   = r('api/expire-bookings.ts');
  const vercel = JSON.parse(r('vercel.json')) as { crons?: { path: string; schedule: string }[] };

  it('есть задание по расписанию', () => {
    expect(vercel.crons).toBeDefined();
    expect(vercel.crons![0]!.path).toBe('/api/expire-bookings');
    expect(vercel.crons![0]!.schedule).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
  });

  it('протухшая бронь становится expired + cancelled', () => {
    expect(cron).toContain("paymentStatus: 'expired'");
    expect(cron).toContain("status:        'cancelled'");
  });

  it('используется общая чистая проверка срока', () => {
    expect(cron).toContain('isTransferOverdue');
  });

  it('endpoint защищён секретом крона', () => {
    expect(cron).toContain('CRON_SECRET');
    expect(cron).toMatch(/bearerToken\(req\) !== secret/);
  });

  it('запись идёт порциями — лимит batch не рушит запуск', () => {
    expect(cron).toContain('BATCH_LIMIT');
  });

  it('счётчики затронутых спектаклей обновляются — освобождённые места видны', () => {
    expect(cron).toContain("collection('showCounters')");
  });
});

describe('оплата наличными ведёт себя одинаково из админки и из сканера', () => {
  const page  = r('src/pages/TicketCheckPage/TicketCheckPage.tsx');
  const admin = r('src/pages/AdminPage/AdminPage.tsx');

  it('оба места отправляют письмо об оплате', () => {
    expect(admin).toContain('sendPaymentPaidEmail');
    expect(page).toContain('sendPaymentPaidEmail');
  });

  it('оба ставят paid вместе с confirmed', () => {
    expect(r('api/checkin-ticket.ts')).toMatch(/paymentStatus: 'paid',\s*\n\s*status:\s*'confirmed'/);
    expect(r('src/services/bookingService.ts')).toMatch(/paymentStatus: 'paid',\s*\n\s*status: 'confirmed'/);
  });

  it('сбой письма не ломает отметку прохода', () => {
    expect(page).toMatch(/sendPaymentPaidEmail\([\s\S]{0,800}\.catch\(/);
  });
});

describe('техническое состояние доставки писем сохраняется', () => {
  const email = r('api/send-email.ts');

  it('успех, отказ и пропуск журналируются', () => {
    expect(email).toContain("status: 'sent'");
    expect(email).toContain("status: 'failed'");
    expect(email).toContain("status: 'skipped'");
  });

  it('адрес получателя в журнал не дублируется', () => {
    const fn = email.slice(email.indexOf('async function logEmailDelivery'), email.indexOf('// ── Handler'));
    expect(fn).not.toContain('to:');
    expect(fn).toContain('uid');
  });

  it('сбой журнала не влияет на отправку письма', () => {
    expect(email).toMatch(/logEmailDelivery[\s\S]{0,700}catch \(err\)[\s\S]{0,200}console\.warn/);
  });

  it('журнал закрыт для клиента правилами', () => {
    expect(r('firestore.rules')).toContain('match /emailLog/{entryId}');
  });
});

describe('подписки Firestore по-прежнему отписываются', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(e)) out.push(full);
    }
    return out;
  }

  it('каждый вызов subscribeTo* возвращается из эффекта или сохраняется для отписки', () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(/^(.*)\bsubscribeTo[A-Za-z]+\(/gm)) {
        const line = m[1]!;
        if (file.endsWith('bookingService.ts') || file.endsWith('statsService.ts')) continue;
        // Корректные формы: `return subscribeTo…`, `const unsub = subscribeTo…`
        // и `useEffect(() => subscribeTo…)` — стрелка с неявным возвратом.
        const returned = /return\s+subscribeTo|=\s*subscribeTo|=>\s*subscribeTo/.test(line + 'subscribeTo');
        if (!returned) offenders.push(`${file.replace(ROOT + '/', '')}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('обёртки подписок возвращают функцию отписки', () => {
    expect(r('src/services/bookingService.ts')).toMatch(/export function subscribeToUserBookings[\s\S]{0,400}\): \(\) => void/);
    expect(r('src/services/statsService.ts')).toMatch(/export function subscribeToAudienceCount[\s\S]{0,200}\): \(\) => void/);
  });
});

describe('ручной чеклист описывает реальную систему', () => {
  const checklist = r('AUTH_TESTING.md');

  it('покрывает потоки, появившиеся после аудита', () => {
    for (const topic of [
      'Отмена брони зрителем',
      'Вместимость зала',
      'Протухание неоплаченного перевода',
      'Проверка билета и проход',
      'Повторная отправка формы',
      'Согласие на cookie',
    ]) {
      expect(checklist, topic).toContain(topic);
    }
  });

  it('перечисляет все обязательные переменные окружения', () => {
    for (const v of ['RESEND_API_KEY', 'EMAIL_FROM', 'FIREBASE_SERVICE_ACCOUNT', 'ALLOWED_ORIGIN', 'CRON_SECRET']) {
      expect(checklist, v).toContain(v);
    }
  });

  it('упоминает служебные коллекции, закрытые для клиента', () => {
    for (const c of ['showCounters', 'loyaltyState', 'idempotencyKeys', 'rateLimits', 'audienceCounted', 'emailLog']) {
      expect(checklist, c).toContain(c);
    }
  });

  it('не утверждает больше, что счётчик зрителей меняет клиент', () => {
    expect(checklist).toContain('увеличивает СЕРВЕР');
  });

  it('каждая переменная из .env.example описана в чеклисте или в CLAUDE.md', () => {
    const env  = r('.env.example');
    const docs = checklist + r('CLAUDE.md');
    const serverVars = [...env.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)]
      .map(m => m[1]!)
      .filter(v => !v.startsWith('VITE_'));
    const missing = serverVars.filter(v => !docs.includes(v));
    expect(missing).toEqual([]);
  });
});
