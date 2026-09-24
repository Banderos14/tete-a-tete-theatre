import { useState } from 'react';
import { suggestEmailFix, emailTypoBlocksSubmit } from '../utils/emailTypo';

/**
 * Подсказка об опечатке в домене почты для формы регистрации.
 *
 * Подсказка появляется после ухода с поля или попытки отправить форму — не
 * посреди набора (пока набрано «gmail.co», это ещё не опечатка). Отправка
 * блокируется, пока зритель не нажал «Исправить» или «Адрес верный».
 */
export function useEmailTypoGuard(email: string, setEmail: (v: string) => void, enabled: boolean) {
  const [touched,   setTouched]   = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const suggestion = enabled ? suggestEmailFix(email) : null;
  const blocks     = enabled && emailTypoBlocksSubmit(email, confirmed);

  return {
    suggestion,
    visible: blocks && touched && suggestion !== null,
    onBlur:  () => setTouched(true),
    /** Вызвать перед отправкой: true — отправлять нельзя, подсказка показана. */
    blocksSubmit: (): boolean => {
      if (!blocks) return false;
      setTouched(true);
      return true;
    },
    fix:  () => { if (suggestion) setEmail(suggestion); },
    keep: () => setConfirmed(email.trim().toLowerCase()),
    reset: () => { setTouched(false); setConfirmed(null); },
  };
}
