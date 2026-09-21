// Банковские реквизиты — один источник правды.
//
// Реквизиты попадают зрителю в трёх местах: карточка брони в кабинете, письмо
// с подтверждением (HTML и текст) и — через paymentAccountId — в саму бронь.
// Если хоть одно из них начнёт хранить свою копию IBAN, часть зрителей пришлёт
// перевод на закрытый счёт, и узнаем мы об этом не сразу. Тест держит и сами
// цифры, и запрет на дубли.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PAYMENT_CONFIG, getPaymentAccount, normalizeIban } from '../../src/config/payment.js';
import type { IbanPaymentAccount } from '../../src/config/payment.js';

const ROOT = resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const account = getPaymentAccount(undefined) as IbanPaymentAccount;

describe('актуальные реквизиты Crédit Agricole', () => {
  it('счёт для перевода описан ровно один', () => {
    expect(PAYMENT_CONFIG.paymentAccounts).toHaveLength(1);
    expect(account.type).toBe('iban');
  });

  it('владелец счёта — ASSOC. CONSTELLATION', () => {
    expect(account.receiverName).toBe('ASSOC. CONSTELLATION');
  });

  it('банк — Crédit Agricole Provence Côte d’Azur', () => {
    expect(account.bankName).toBe('Crédit Agricole Provence Côte d’Azur');
  });

  it('IBAN и BIC совпадают с выпиской', () => {
    expect(account.iban).toBe('FR76 1910 6006 0043 6695 8779 294');
    expect(account.bic).toBe('AGRIFRPP891');
  });

  it('IBAN без пробелов — то же самое, что в письме', () => {
    expect(normalizeIban(account.iban)).toBe('FR7619106006004366958779294');
    expect(normalizeIban(account.iban)).toHaveLength(27);  // французский IBAN
  });

  it('RIB разложен по полям и совпадает с IBAN', () => {
    const rib = account.rib!;
    expect(rib).toEqual({
      bankCode: '19106', branchCode: '00600', accountNumber: '43669587792', key: '94',
    });
    // FR-IBAN = FR + 2 контрольные + банк(5) + отделение(5) + счёт(11) + ключ(2).
    const digits = normalizeIban(account.iban);
    expect(digits.slice(4)).toBe(rib.bankCode + rib.branchCode + rib.accountNumber + rib.key);
  });

  it('id счёта не меняли — на него ссылаются уже созданные брони', () => {
    expect(account.id).toBe('fr_eu_bank');
  });
});

describe('старых реквизитов не осталось нигде', () => {
  const sources = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'server')),
                   ...walk(join(ROOT, 'shared')), ...walk(join(ROOT, 'api'))]
    .map(f => readFileSync(f, 'utf8')).join('\n');

  it('прежний IBAN BNP Paribas удалён из кода', () => {
    expect(sources).not.toContain('FR76 3000 4007 0900 0024 0656 507');
    expect(sources).not.toContain('FR7630004007090000240656507');
    expect(sources).not.toContain('BNPAFRPPXXX');
    expect(sources).not.toContain('BNP Paribas');
  });

  it('index.html и публичные файлы не содержат реквизитов', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).not.toContain('FR76');
    expect(html).not.toContain('AGRIFRPP');
  });
});

describe('реквизиты не продублированы', () => {
  const sources = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'server')),
                   ...walk(join(ROOT, 'shared')), ...walk(join(ROOT, 'api'))];

  it('IBAN и BIC записаны только в shared/config/payment.ts', () => {
    const holders = sources.filter(f => {
      const src = readFileSync(f, 'utf8');
      return src.includes('FR76 1910') || src.includes('AGRIFRPP891');
    });
    expect(holders.map(f => f.slice(ROOT.length + 1)))
      .toEqual(['shared/config/payment.ts']);
  });

  it('потребители берут счёт через getPaymentAccount, а не своей константой', () => {
    const card  = readFileSync(join(ROOT, 'src/components/ui/ProfileDrawer/BookingCard.tsx'), 'utf8');
    const email = readFileSync(join(ROOT, 'shared/email/ticketEmail.ts'), 'utf8');
    expect(card).toContain('getPaymentAccount');
    expect(email).toContain('getPaymentAccount');
  });

  it('письмо отдаёт IBAN и в обычном виде, и без пробелов — банки просят по-разному', () => {
    const email = readFileSync(join(ROOT, 'shared/email/ticketEmail.ts'), 'utf8');
    expect(email).toContain('normalizeIban(account.iban)');
    expect(email).toContain('IBAN без пробелов');
    expect(email).toContain('IBAN sans espaces');
  });
});
