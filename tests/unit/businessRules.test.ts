import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { endpointSource, functionBody, projectSource, screenSource } from '../helpers/serverSource.js';

const ROOT = resolve(__dirname, '../..');
const r = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('протухание брони происходит надёжно, а не «когда кто-нибудь зайдёт»', () => {
  const cron   = endpointSource('api/expire-bookings.ts');
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
    // Поведение проверки — в tests/unit/cronAuth.test.ts; здесь достаточно,
    // что защита на месте и стоит до бизнес-логики.
    expect(cron).toContain('CRON_SECRET');
    expect(cron).toContain('requireCronSecret(req)');
  });

  it('расписание укладывается в суточный лимит Hobby-плана Vercel', () => {
    // Ежечасный cron ронял production deployment целиком: Vercel отвергает
    // конфигурацию ещё на этапе сборки, а не молча игнорирует задание.
    const [minute, hour] = vercel.crons![0]!.schedule.split(' ');
    expect(minute, 'минута должна быть фиксированной').toMatch(/^\d+$/);
    expect(hour, 'час должен быть фиксированным — не чаще раза в сутки').toMatch(/^\d+$/);
  });

  it('каждая бронь аннулируется своей транзакцией с повторной проверкой срока', () => {
    // пакетная запись не умела «только если не изменилось» и затирал оплату,
    // отмеченную между запросом и записью.
    expect(cron).toContain('runTransaction');
    expect(cron).toMatch(/tx\.get\(d\.ref\)[\s\S]{0,200}overdue\(data, nowMs\)/);
    expect(cron).not.toContain('batch.update');
  });

  it('счётчики затронутых спектаклей обновляются — освобождённые места видны', () => {
    expect(cron).toContain("SHOW_COUNTERS = 'showCounters'");
    expect(cron).toContain('collection(SHOW_COUNTERS)');
  });
});

describe('оплата одинакова из админки и из сканера', () => {
  const page  = screenSource('src/pages/TicketCheckPage');
  const admin = r('src/pages/AdminPage/useAdminData.ts');

  it('оба места зовут одно серверное действие mark_paid', () => {
    expect(admin).toContain("action: 'mark_paid'");
    expect(page).toContain("'mark_paid'");
  });

  it('paid ставится вместе с confirmed в одном серверном хелпере', () => {
    expect(functionBody(r('server/checkin/checkin.service.ts'), 'paidTransition'))
      .toMatch(/paymentStatus: 'paid',\s*\n\s*status:\s*'confirmed'/);
  });

  it('письмо об оплате отправляет сервер, а не браузер', () => {
    expect(page).not.toContain('sendPaymentPaidEmail');
    expect(admin).not.toContain('sendPaymentPaidEmail');
    const router = r('server/admin/adminBooking.service.ts');
    expect(router).toMatch(/case 'mark_paid'[\s\S]{0,600}sendBookingEmail\(result\.booking\.bookingId, 'paid'\)/);
  });
});

describe('техническое состояние доставки писем сохраняется', () => {
  const email = r('server/email/ticketEmail.service.ts');

  it('успех, отказ и пропуск журналируются', () => {
    expect(email).toContain("status: 'sent'");
    expect(email).toContain("status: 'failed'");
    expect(email).toContain("status: 'skipped'");
    expect(email).toContain('logEmailDelivery(');
  });

  it('адрес получателя в журнал не дублируется', () => {
    const fn = functionBody(projectSource('server/email/email.repository.ts'), 'logEmailDelivery');
    expect(fn).not.toContain('to:');
    expect(fn).toContain('uid');
  });

  it('сбой журнала не влияет на отправку письма', () => {
    const repo = functionBody(r('server/email/email.repository.ts'), 'logEmailDelivery');
    expect(repo).toMatch(/catch \(err\)[\s\S]{0,200}console\.warn/);
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
