import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Booking } from '../../src/types/booking.js';
import {
  validate,
  isValidBirthday,
  todayIso,
  getInitials,
  formatBirthdayDisplay,
  mapFbError,
} from '../../src/components/ui/ProfileDrawer/profileValidation.js';
import {
  groupAttendedBookings,
  pluralRaz,
  showInitials,
} from '../../src/components/ui/ProfileDrawer/attendedGrouping.js';
import { getStubVariant, parseShowDateParts } from '../../src/utils/ticketStub.js';

const ROOT = resolve(__dirname, '../..');
const DRAWER_DIR = join(ROOT, 'src/components/ui/ProfileDrawer');

// ── Валидация формы профиля ─────────────────────────────────────────────────

describe('валидация профиля', () => {
  const messages = { required: 'обязательно', phoneInvalid: 'телефон', birthdayInvalid: 'дата' };
  const TODAY = '2026-09-25';
  const check = (fields: Partial<Parameters<typeof validate>[0]>) =>
    validate({ displayName: 'Аня', birthday: '', phone: '', ...fields }, messages, TODAY);

  it('обязательно только имя: пустые дата рождения и телефон не мешают сохранить', () => {
    expect(check({})).toEqual({});
    expect(check({ displayName: '' })).toEqual({ displayName: 'обязательно' });
  });

  it('пробелы в имени не считаются заполнением', () => {
    expect(check({ displayName: '   ' }).displayName).toBe('обязательно');
  });

  it('введённый телефон проверяется: обрывок — ошибка, любой корректный номер — нет', () => {
    expect(check({ phone: '+33 7 49' }).phone).toBe('телефон');
    for (const phone of ['07 49 66 19 40', '+33 7 49 66 19 40', '0033 7 49 66 19 40', '+380 67 123 45 67', '+7 916 123 45 67']) {
      expect(check({ phone }), phone).toEqual({});
    }
  });

  it('старый нераспознаваемый номер из профиля не блокирует сохранение, пока его не меняли', () => {
    expect(check({ phone: '12345678', storedPhone: '12345678' })).toEqual({});
    expect(check({ phone: '1234567', storedPhone: '12345678' }).phone).toBe('телефон');
  });

  it('дата рождения: будущая, несуществующая и слишком ранняя — ошибка', () => {
    expect(check({ birthday: '1990-01-01' })).toEqual({});
    expect(check({ birthday: TODAY })).toEqual({});
    expect(check({ birthday: '2026-09-26' }).birthday).toBe('дата');
    expect(check({ birthday: '2027-01-01' }).birthday).toBe('дата');
    expect(check({ birthday: '1990-02-31' }).birthday).toBe('дата');
    expect(check({ birthday: '1899-12-31' }).birthday).toBe('дата');
    expect(check({ birthday: '01.02.1990' }).birthday).toBe('дата');
  });

  it('29 февраля — только в високосный год', () => {
    expect(isValidBirthday('2000-02-29', TODAY)).toBe(true);
    expect(isValidBirthday('2001-02-29', TODAY)).toBe(false);
  });

  it('«сегодня» — по часам устройства, а не UTC: поздним вечером в Ницце граница не сдвигается', () => {
    // 25.09 23:30 по местному времени — это уже 26.09 в UTC при положительном поясе.
    expect(todayIso(new Date(2026, 8, 25, 23, 30))).toBe('2026-09-25');
    expect(todayIso(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });

  it('показ даты не сдвигается на день ни в каком часовом поясе', () => {
    expect(formatBirthdayDisplay('1990-01-01', 'RU')).toBe('1 января 1990 г.');
    expect(formatBirthdayDisplay('1990-12-31', 'FR')).toBe('31 décembre 1990');
  });
});

describe('кабинет не заставляет заполнять дату рождения и телефон', () => {
  const drawer = readFileSync(join(DRAWER_DIR, 'ProfileDrawer.tsx'), 'utf8');
  const personal = readFileSync(join(DRAWER_DIR, 'PersonalSection.tsx'), 'utf8');
  const css = readFileSync(join(DRAWER_DIR, 'ProfileDrawer.module.scss'), 'utf8');

  it('нет принудительной пульсации незаполненных полей', () => {
    expect(drawer).not.toMatch(/pulse/i);
    expect(personal).not.toMatch(/pulse/i);
    expect(css).not.toContain('fieldPulse');
  });

  it('повторное закрытие с несохранёнными изменениями закрывает кабинет без сохранения', () => {
    expect(drawer).toContain('if (form.isDirty && !warnVisible) {');
    expect(drawer).toContain('if (form.isDirty) form.reset();');
  });

  it('поле даты: нельзя выбрать будущее и годы раньше 1900; помечено «необязательно»', () => {
    expect(personal).toContain('max={todayIso()}');
    expect(personal).toContain('min={`${MIN_BIRTH_YEAR}-01-01`}');
    expect(personal).toContain('hint={t.profile.optional}');
  });
});

describe('инициалы', () => {
  it('берутся из первых двух слов', () => {
    expect(getInitials('Анна Каренина')).toBe('АК');
  });

  it('лишние слова игнорируются', () => {
    expect(getInitials('Жан Батист Поклен')).toBe('ЖБ');
  });

  it('пустое имя не роняет рендер', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials(null)).toBe('?');
    expect(getInitials(undefined)).toBe('?');
  });

  it('имя из одних пробелов не роняет рендер', () => {
    // Живой сценарий: пользователь начинает вводить имя с пробела. Раньше
    // getInitials падал на w[0], и ErrorBoundary уносил весь кабинет.
    expect(getInitials('   ')).toBe('?');
    expect(getInitials(' \t ')).toBe('?');
  });

  it('ведущие пробелы не съедают первую букву', () => {
    expect(getInitials('  Анна Каренина')).toBe('АК');
  });
});

describe('дата рождения', () => {
  const personalSection = readFileSync(join(DRAWER_DIR, 'PersonalSection.tsx'), 'utf8');

  it('мусор отдаётся как есть, а не как Invalid Date', () => {
    expect(formatBirthdayDisplay('не дата', 'RU')).toBe('не дата');
  });

  it('валидная дата локализуется по языку', () => {
    expect(formatBirthdayDisplay('1990-05-17', 'FR')).toContain('1990');
    expect(formatBirthdayDisplay('1990-05-17', 'RU')).toContain('1990');
  });

  it('клик по видимому полю явно открывает нативный календарь', () => {
    expect(personalSection).toContain('input.showPicker()');
    expect(personalSection).toContain('onClick={openBirthdayPicker}');
  });
});

describe('ошибки привязки Facebook', () => {
  it('известный код переводится', () => {
    expect(mapFbError({ code: 'auth/popup-closed-by-user' }, 'RU')).toBe('Окно закрыто');
    expect(mapFbError({ code: 'auth/popup-closed-by-user' }, 'FR')).toBe('Fenêtre fermée');
  });

  it('неизвестный код и не-объект дают общий текст, а не падение', () => {
    expect(mapFbError({ code: 'auth/что-то-новое' }, 'RU')).toContain('недоступен');
    expect(mapFbError('строка', 'RU')).toContain('недоступен');
    expect(mapFbError(null, 'FR')).toContain('indisponible');
  });
});

// ── Группировка посещённых спектаклей ───────────────────────────────────────

function booking(over: Partial<Booking> & { showId: string; createdAtMs: number }): Booking {
  const { createdAtMs, ...rest } = over;
  return {
    id: `${over.showId}-${createdAtMs}`,
    showTitle: 'Спектакль',
    showDate: '17 Май 2026',
    showTime: '19:00',
    userId: 'u1', userName: '', userEmail: '', userPhone: '',
    ticketsCount: 1, ticketType: 'standard', priceInfo: '', totalAmount: 20,
    ticketCode: 'AAAA-BBBB', status: 'confirmed',
    paymentMethod: 'on_site', paymentStatus: 'paid', comment: '',
    createdAt: { toMillis: () => createdAtMs } as Booking['createdAt'],
    ...rest,
  } as Booking;
}

describe('группировка посещённых спектаклей', () => {
  it('одинаковые спектакли схлопываются в одну строку со счётчиком', () => {
    const groups = groupAttendedBookings([
      booking({ showId: 'a', createdAtMs: 1 }),
      booking({ showId: 'a', createdAtMs: 2 }),
      booking({ showId: 'b', createdAtMs: 3 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.showId === 'a')!.count).toBe(2);
    expect(groups.find(g => g.showId === 'b')!.count).toBe(1);
  });

  it('в строке остаются дата и время самой поздней брони', () => {
    const [group] = groupAttendedBookings([
      booking({ showId: 'a', createdAtMs: 1, showDate: '01 Янв 2026', showTime: '18:00' }),
      booking({ showId: 'a', createdAtMs: 9, showDate: '17 Май 2026', showTime: '19:00' }),
    ]);
    expect(group!.lastDate).toBe('17 Май 2026');
    expect(group!.lastTime).toBe('19:00');
  });

  it('порядок броней не влияет на результат', () => {
    const asc  = groupAttendedBookings([
      booking({ showId: 'a', createdAtMs: 1, showDate: '01 Янв 2026' }),
      booking({ showId: 'a', createdAtMs: 9, showDate: '17 Май 2026' }),
    ]);
    const desc = groupAttendedBookings([
      booking({ showId: 'a', createdAtMs: 9, showDate: '17 Май 2026' }),
      booking({ showId: 'a', createdAtMs: 1, showDate: '01 Янв 2026' }),
    ]);
    expect(desc[0]!.lastDate).toBe(asc[0]!.lastDate);
  });

  it('пустой список даёт пустой результат', () => {
    expect(groupAttendedBookings([])).toEqual([]);
  });
});

describe('склонение «раз»', () => {
  it('единственное и малые числа', () => {
    expect(pluralRaz(1)).toBe('раз');
    expect(pluralRaz(2)).toBe('раза');
    expect(pluralRaz(4)).toBe('раза');
    expect(pluralRaz(5)).toBe('раз');
  });

  it('подростковые числа — исключение', () => {
    expect(pluralRaz(11)).toBe('раз');
    expect(pluralRaz(12)).toBe('раз');
    expect(pluralRaz(14)).toBe('раз');
    expect(pluralRaz(22)).toBe('раза');
  });
});

describe('инициалы спектакля для заглушки афиши', () => {
  it('кавычки не попадают в глиф', () => {
    expect(showInitials('«Вишнёвый сад»')).toBe('ВС');
  });

  it('короткие слова пропускаются', () => {
    expect(showInitials('На дне реки')).toBe('ДР');
  });

  it('название из одних коротких слов не падает', () => {
    expect(showInitials('Он и я')).toBe('О');
  });
});

// ── Общий корешок билета ────────────────────────────────────────────────────

describe('корешок билета общий для билета и брони', () => {
  const base = booking({ showId: 'a', createdAtMs: 1 });

  it('отменённая и протухшая бронь — серый корешок', () => {
    expect(getStubVariant({ ...base, status: 'cancelled' })).toBe('grey');
    expect(getStubVariant({ ...base, paymentStatus: 'expired' })).toBe('grey');
  });

  it('оплаченная — бордовый, ждущая перевода — янтарный', () => {
    expect(getStubVariant({ ...base, paymentStatus: 'paid' })).toBe('burgundy');
    expect(getStubVariant({ ...base, paymentStatus: 'awaiting_transfer' })).toBe('amber');
  });

  it('оплата на месте до оплаты — янтарный', () => {
    expect(getStubVariant({ ...base, paymentMethod: 'on_site', paymentStatus: 'not_paid' })).toBe('amber');
  });

  it('отмена важнее оплаты — иначе отменённый билет выглядел бы действительным', () => {
    expect(getStubVariant({ ...base, status: 'cancelled', paymentStatus: 'paid' })).toBe('grey');
  });

  it('месяц переводится на французский, а мусорная дата не роняет разбор', () => {
    expect(parseShowDateParts('17 Май 2026', true)).toEqual({ day: '17', monthAbbrev: 'Mai' });
    expect(parseShowDateParts('17 Май 2026', false)).toEqual({ day: '17', monthAbbrev: 'май' });
    expect(parseShowDateParts('', true)).toEqual({ day: '—', monthAbbrev: '' });
  });
});

// ── Структура кабинета ──────────────────────────────────────────────────────

describe('кабинет разложен по файлам', () => {
  const drawer = readFileSync(join(DRAWER_DIR, 'ProfileDrawer.tsx'), 'utf8');

  it('ProfileDrawer остался оболочкой, а не свалкой', () => {
    const lines = drawer.split('\n').length;
    expect(lines, `ProfileDrawer.tsx: ${lines} строк`).toBeLessThanOrEqual(400);
  });

  it('все импорты стоят в шапке файла', () => {
    // Раньше в середине файла был второй блок import — признак того, что в один
    // модуль слили несколько компонентов. Такой файл нельзя читать сверху вниз.
    const lines = drawer.split('\n');
    const lastImport  = lines.findLastIndex(l => l.startsWith('import '));
    const firstNonImport = lines.findIndex(l => /^(export |function |const |interface |type )/.test(l));
    expect(lastImport).toBeLessThan(firstNonImport);
  });

  it('ни один файл кабинета не разросся до прежних размеров', () => {
    const tooBig = readdirSync(DRAWER_DIR)
      .filter(f => /\.tsx?$/.test(f))
      .map(f => [f, readFileSync(join(DRAWER_DIR, f), 'utf8').split('\n').length] as const)
      .filter(([, lines]) => lines > 400)
      .map(([f, lines]) => `${f}: ${lines} строк`);
    expect(tooBig).toEqual([]);
  });

  it('стили подключаются только свои — модуль лежит рядом', () => {
    const foreign = readdirSync(DRAWER_DIR)
      .filter(f => f.endsWith('.tsx'))
      .filter(f => /from '[^']*\.\.\/[^']*\.module\.scss'/.test(readFileSync(join(DRAWER_DIR, f), 'utf8')));
    expect(foreign).toEqual([]);
  });
});
