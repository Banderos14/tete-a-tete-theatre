import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const pkg  = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

const sources = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'api')),
                 ...walk(join(ROOT, 'server')), ...walk(join(ROOT, 'shared'))]
  .map(f => readFileSync(f, 'utf8'))
  .join('\n');

describe('неиспользуемые зависимости удалены', () => {
  it('leaflet и @types/leaflet больше не числятся', () => {
    expect(pkg.dependencies).not.toHaveProperty('leaflet');
    expect(pkg.dependencies).not.toHaveProperty('@types/leaflet');
    expect(pkg.devDependencies ?? {}).not.toHaveProperty('@types/leaflet');
  });

  it('пакет leaflet действительно нигде не импортируется', () => {
    expect(sources).not.toMatch(/from ['"]leaflet['"]/);
    expect(sources).not.toMatch(/import\(['"]leaflet/);
    expect(sources).not.toMatch(/require\(['"]leaflet/);
  });

  it('карта на месте — компонент никуда не делся', () => {
    expect(existsSync(join(ROOT, 'src/components/Contacts/LeafletMap.tsx'))).toBe(true);
    const map = readFileSync(join(ROOT, 'src/components/Contacts/LeafletMap.tsx'), 'utf8');
    expect(map).toContain('<iframe');
  });
});

describe('мёртвый код удалён', () => {
  it('ticketService удалён — генерация кода живёт на сервере', () => {
    expect(existsSync(join(ROOT, 'src/services/ticketService.ts'))).toBe(false);
  });

  it('клиентский createBooking удалён — правила Firestore его всё равно запрещали', () => {
    const svc = readFileSync(join(ROOT, 'src/services/bookingService.ts'), 'utf8');
    expect(svc).not.toMatch(/export async function createBooking\(/);
  });

  it('getUserBookingsOnce и formatIban удалены', () => {
    expect(sources).not.toMatch(/export async function getUserBookingsOnce/);
    expect(sources).not.toMatch(/export function formatIban/);
  });

  it('тип NewBooking удалён вместе с единственным потребителем', () => {
    expect(sources).not.toContain('NewBooking');
  });

  it('устаревших упоминаний subscribeToShowBookedSeats не осталось', () => {
    expect(sources).not.toContain('subscribeToShowBookedSeats');
  });

  it('генерация кода билета осталась ровно в одном месте — на сервере', () => {
    const api = readFileSync(join(ROOT, 'server/booking/ticketCode.ts'), 'utf8');
    expect(api).toContain('function generateTicketCode');
    expect(sources.match(/function generateTicketCode/g)).toHaveLength(1);
  });
});

describe('используемые зависимости на месте', () => {
  for (const dep of ['react', 'react-dom', 'react-router-dom', 'firebase', 'firebase-admin',
                     'qrcode', 'html5-qrcode', 'jspdf', 'pdfjs-dist', '@tabler/icons-react']) {
    it(`${dep} остался в зависимостях`, () => {
      expect(pkg.dependencies).toHaveProperty(dep);
    });
  }
});
