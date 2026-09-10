import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT   = resolve(__dirname, '../..');
const api    = readFileSync(resolve(ROOT, 'api/register-audience.ts'), 'utf8');
const stats  = readFileSync(resolve(ROOT, 'src/services/statsService.ts'), 'utf8');
const auth   = readFileSync(resolve(ROOT, 'src/context/AuthContext.tsx'), 'utf8');
const rules  = readFileSync(resolve(ROOT, 'firestore.rules'), 'utf8');

describe('счётчик зрителей увеличивается ровно один раз на пользователя', () => {
  it('инкремент выполняет сервер, а не клиент', () => {
    expect(stats).toContain('/api/register-audience');
    expect(stats).not.toContain('increment(');
    expect(stats).not.toContain("setDoc(statsRef");
  });

  it('в клиенте остался ровно ОДИН вызов инкремента', () => {
    const calls = [...auth.matchAll(/ensureAudienceCounterAndIncrement\(/g)];
    // один вызов + одна строка импорта
    expect(calls.length).toBe(1);
  });

  it('повторный вызов ничего не меняет — отметка audienceCounted', () => {
    expect(api).toContain("db.collection('audienceCounted').doc(uid)");
    expect(api).toMatch(/if \(markerSnap\.exists\) return false;/);
  });

  it('отметка и счётчик пишутся одной транзакцией', () => {
    const txStart = api.indexOf('runTransaction');
    const txEnd   = api.indexOf('} catch (err) {', txStart);
    const tx      = api.slice(txStart, txEnd);
    expect(tx).toContain('tx.set(statsRef');
    expect(tx).toContain('tx.create(markerRef');
  });

  it('читает текущее значение, а не перезаписывает стартовым', () => {
    expect(api).toContain('current + 1');
    expect(api).toContain('AUDIENCE_BASELINE');
  });

  it('сбой счётчика не ломает регистрацию', () => {
    expect(api).toMatch(/catch[\s\S]{0,200}respond\(res, 200/);
    expect(stats).toMatch(/catch \{[\s\S]{0,160}\}/);
  });
});

describe('правила Firestore: счётчик и служебные коллекции', () => {
  it('stats читается всеми, но клиентом не пишется', () => {
    const block = rules.slice(rules.indexOf('match /stats/'), rules.indexOf('// ── Служебные'));
    expect(block).toContain('allow read:  if true');
    expect(block).toContain('allow write: if false');
    expect(block).not.toContain('audienceCount + 1');
  });

  it('служебные серверные коллекции закрыты для клиента', () => {
    for (const c of ['showCounters', 'loyaltyState', 'idempotencyKeys', 'rateLimits', 'audienceCounted']) {
      expect(rules, c).toMatch(new RegExp(`match /${c}/\\{[a-zA-Z]+\\}\\s*\\{ allow read, write: if false; \\}`));
    }
  });

  it('прямое создание брони клиентом по-прежнему запрещено', () => {
    expect(rules).toContain('allow create: if false;');
  });

  it('эскалация роли по-прежнему закрыта', () => {
    expect(rules).toContain("request.resource.data.role == 'user'");
    expect(rules).toContain('request.resource.data.role == resource.data.role');
  });
});
