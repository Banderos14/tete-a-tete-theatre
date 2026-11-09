// Выбор сеанса постановки с несколькими показами («Фунтик», «Страна сладостей»).
//
// Каждый сеанс — отдельная запись каталога (свой id, своя вместимость), поэтому
// здесь выбирается именно сеанс, а форма брони открывается уже для него.
// Показываются только предстоящие сеансы: прошедший купить нельзя.

import type { Show } from '../../../../types';
import { sessionDateLabel } from './sessionDateLabel';
import styles from './SessionPicker.module.scss';

interface Props {
  sessions:   readonly Show[];
  selectedId: string;
  onSelect:   (showId: string) => void;
  /** Свободно мест по id сеанса; null — остаток неизвестен (не показываем). */
  seatsLeft:  Record<string, number> | null;
  lang:       'RU' | 'FR';
  t: {
    months: Record<string, string>;
    showModal: {
      labelSessions: string;
      chooseSession: string;
      sessionSoldOut: string;
      sessionSeatsLeft: (n: number) => string;
    };
  };
}

export function SessionPicker({ sessions, selectedId, onSelect, seatsLeft, lang, t }: Props) {
  return (
    <div className={styles.picker}>
      <div className={styles.label} id="session-picker-label">
        {t.showModal.labelSessions}
        <span className={styles.labelHint}>{t.showModal.chooseSession}</span>
      </div>
      <div className={styles.list} role="radiogroup" aria-labelledby="session-picker-label">
        {sessions.map((s) => {
          const active = s.id === selectedId;
          const left   = seatsLeft?.[s.id];
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${styles.option} ${active ? styles.optionActive : ''}`}
              onClick={() => onSelect(s.id)}
            >
              <span className={`${styles.dot} ${active ? styles.dotActive : ''}`} aria-hidden="true" />
              <span className={styles.date}>{sessionDateLabel(s, lang, t.months)}</span>
              {typeof left === 'number' && (
                <span className={`${styles.seats} ${left <= 0 ? styles.seatsOut : ''}`}>
                  {left <= 0 ? t.showModal.sessionSoldOut : t.showModal.sessionSeatsLeft(left)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
