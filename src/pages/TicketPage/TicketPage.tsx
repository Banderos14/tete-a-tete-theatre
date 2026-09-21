// Публичная страница билета: /#/ticket?code=XXXX-XXXX[&lang=FR]
//
// Сюда ведёт кнопка «Открыть билет» из письма. Вход НЕ нужен: письмо часто
// открывается в другом браузере, чем покупка, а зрителю нужен только QR.
//
// Страница полностью клиентская: QR строится из кода в ссылке той же функцией,
// что в кабинете, PDF и письме (ticketQrContent → ticketQrPayload). Ни Firestore,
// ни API не читаются — поэтому здесь нет и не может быть персональных данных,
// статуса оплаты или действий с бронью. QR и так является предъявляемым
// билетом: всё, что есть на странице, уже содержится в самой ссылке.
// Личный кабинет по-прежнему требует входа. Ссылка на него — /?account=tickets,
// а не #/?account=tickets: переход по хешу внутри уже открытого приложения
// не перезапускает разбор параметра, и кабинет бы не открылся.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLang } from '../../i18n/LangContext';
import { generateTicketQR } from '../../services/qrService';
import { normalizeTicketCodeInput } from '../../../shared/domain/ticketCode';
import styles from './TicketPage.module.scss';

const EN_INSTRUCTION = 'Show this QR code to the theatre staff at the entrance.';

export function TicketPage() {
  const [params] = useSearchParams();
  const { lang: appLang } = useLang();
  // Язык брони приходит в ссылке письма: в новом браузере настройки сайта ещё нет.
  const urlLang = params.get('lang');
  const isFR = urlLang === 'FR' || (urlLang !== 'RU' && appLang === 'FR');

  const code = normalizeTicketCodeInput(params.get('code') ?? '');
  const [qrSrc, setQrSrc]   = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!code) return;
    let stale = false;
    generateTicketQR(code)
      .then(src => { if (!stale) setQrSrc(src); })
      .catch(() => { if (!stale) setFailed(true); });
    return () => { stale = true; };
  }, [code]);

  if (!code) {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Théâtre Tête-à-Tête</p>
        <h1 className={styles.title}>{isFR ? 'Lien de billet invalide' : 'Ссылка на билет повреждена'}</h1>
        <p className={styles.text}>
          {isFR
            ? 'Ouvrez à nouveau l’e-mail de réservation ou votre espace « Mes billets ».'
            : 'Откройте письмо о брони ещё раз или раздел «Мои билеты» в личном кабинете.'}
        </p>
        <a className={styles.secondaryLink} href="/?account=tickets">
          {isFR ? 'Mes billets' : 'Мои билеты'}
        </a>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Théâtre Tête-à-Tête</p>
      <h1 className={styles.title}>{isFR ? 'Votre billet' : 'Ваш билет'}</h1>

      <div className={styles.qrCard}>
        {qrSrc
          ? <img className={styles.qr} src={qrSrc} alt={`QR ${code}`} />
          : <div className={`${styles.qr} ${failed ? styles.qrFailed : styles.qrLoading}`} aria-hidden="true" />}
        <p className={styles.code}>{code}</p>
        <p className={styles.codeLabel}>{isFR ? 'Code de réservation' : 'Код брони'}</p>
      </div>

      <p className={styles.instruction}>
        {isFR
          ? 'Présentez ce QR code au personnel du théâtre à l’entrée.'
          : 'Покажите этот QR-код сотруднику театра при входе.'}
      </p>
      <p className={styles.instructionEn}>{EN_INSTRUCTION}</p>
      {failed && (
        <p className={styles.text} role="alert">
          {isFR
            ? 'Le QR code ne s’affiche pas : donnez simplement ce code de réservation à l’entrée.'
            : 'QR-код не отобразился — просто назовите этот код брони на входе.'}
        </p>
      )}

      <a className={styles.secondaryLink} href="/?account=tickets">
        {isFR ? 'Espace personnel' : 'Личный кабинет'}
      </a>
    </main>
  );
}
