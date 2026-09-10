import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const hook = readFileSync(resolve(ROOT, 'src/hooks/useModalA11y.ts'), 'utf8');

const modals: [string, string][] = [
  ['AuthModal',     'src/components/ui/AuthModal/AuthModal.tsx'],
  ['BookingModal',  'src/components/ui/BookingModal/BookingModal.tsx'],
  ['ProfileDrawer', 'src/components/ui/ProfileDrawer/ProfileDrawer.tsx'],
];

describe('useModalA11y', () => {
  it('закрывает по Escape', () => {
    expect(hook).toContain("e.key === 'Escape'");
    expect(hook).toContain('onCloseRef.current()');
  });

  it('ставит начальный фокус', () => {
    expect(hook).toMatch(/items\[0\]!\.focus\(\)/);
  });

  it('удерживает фокус: Tab и Shift+Tab замыкаются', () => {
    expect(hook).toContain('e.shiftKey');
    expect(hook).toContain('last.focus()');
    expect(hook).toContain('first.focus()');
  });

  it('возвращает фокус инициатору при закрытии', () => {
    expect(hook).toContain('previouslyFocused');
    expect(hook).toMatch(/document\.contains\(target\)\) target\.focus\(\)/);
  });

  it('не зависит от нестабильного onClose — иначе фокус утекал бы наружу', () => {
    expect(hook).toContain('onCloseRef');
    expect(hook).toMatch(/\}, \[open\]\);/);
  });

  it('не трогает блокировку скролла — ею занимается useScrollLock', () => {
    expect(hook).not.toContain('overflow');
    expect(hook).not.toContain('body.style');
  });
});

describe('хук подключён во все модалки', () => {
  for (const [name, path] of modals) {
    it(`${name} использует useModalA11y`, () => {
      const src = readFileSync(resolve(ROOT, path), 'utf8');
      expect(src).toContain('useModalA11y(');
    });
  }

  it('ProfileDrawer закрывается через tryClose — несохранённые изменения не теряются', () => {
    const src = readFileSync(resolve(ROOT, modals[2]![1]), 'utf8');
    expect(src).toContain('useModalA11y(open, tryClose, dialogRef)');
  });

  it('useScrollLock остался во всех модалках', () => {
    for (const [name, path] of modals) {
      const src = readFileSync(resolve(ROOT, path), 'utf8');
      expect(src, name).toContain('useScrollLock(');
    }
  });
});
