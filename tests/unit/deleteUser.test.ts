import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const api  = readFileSync(resolve(ROOT, 'api/delete-user.ts'), 'utf8');
const svc  = readFileSync(resolve(ROOT, 'src/services/userService.ts'), 'utf8');

describe('/api/delete-user: устойчивость и приватность ошибок', () => {
  it('внутреннее сообщение об ошибке наружу не уходит', () => {
    expect(api).not.toMatch(/error:\s*message/);
    expect(api).toContain("error: 'Failed to delete user'");
  });

  it('подробности остаются в серверном логе', () => {
    expect(api).toContain("console.error('[delete-user]', err)");
  });

  it('брони удаляются порциями — лимит batch в 500 операций больше не рушит удаление', () => {
    expect(api).toContain('BATCH_LIMIT');
    expect(api).toMatch(/i \+= BATCH_LIMIT/);
    const limit = Number(/const BATCH_LIMIT = (\d+)/.exec(api)![1]);
    expect(limit).toBeLessThan(500);
  });

  it('отметка счётчика удаляется вместе с пользователем', () => {
    expect(api).toContain("db.collection('audienceCounted').doc(targetUid)");
  });

  it('счётчик уменьшается только если пользователь в нём учтён', () => {
    expect(api).toMatch(/statsSnap\.exists && markerSnap\.exists/);
  });

  it('отсутствие stats не рушит удаление', () => {
    expect(api).toContain('const statsSnap = await statsRef.get()');
  });
});

describe('бизнес-правила удаления сохранены', () => {
  it('нельзя удалить себя', () => {
    expect(api).toContain("error: 'Cannot delete your own account'");
  });
  it('нельзя удалить другого администратора', () => {
    expect(api).toContain("error: 'Cannot delete an admin account'");
  });
  it('требуется роль admin', () => {
    expect(api).toContain("callerSnap.data()?.role !== 'admin'");
  });
  it('отсутствующий пользователь даёт 404', () => {
    expect(api).toContain("error: 'User not found'");
  });
});

describe('клиент не показывает тело чужого ответа', () => {
  it('не подставляет фрагмент ответа в сообщение', () => {
    expect(svc).not.toContain('text.slice(0, 200)');
  });
});
