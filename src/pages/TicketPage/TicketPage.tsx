// Публичная страница билета: /#/ticket?code=XXXX-XXXX[&lang=FR]
//
// Сюда ведут кнопка «Открыть билет» из письма и ссылка из письма об отмене.
// Вход НЕ нужен: письмо часто открывается в другом браузере, чем покупка
// (Gmail → Chrome, а входил зритель в Safari), и сессии Firebase там нет.
// Сессию между браузерами не переносим и токенов в ссылку не кладём — ссылка
// просто не требует входа.
//
// Статус брони приходит с публичного endpoint'а /api/public-ticket (только
// чтение, без персональных данных): отменённый, возвращённый или неоплаченный
// онлайн билет QR не получает. QR строится из кода в ссылке той же функцией,
// что в кабинете, PDF и письме (ticketQrContent → ticketQrPayload).
// Если статус проверить не удалось (сеть, сбой), QR показывается с пометкой:
// решает сканер на входе, а зритель без связи не должен остаться без билета.
//
// Личный кабинет («Мои билеты и лояльность») по-прежнему требует входа: ссылка
// ведёт в существующий поток — вошёл в этом браузере, кабинет откроется сразу,
// нет — обычное окно входа, и только по нажатию. Сама страница окно входа не
// открывает. На iPhone в другом браузере, чем Safari, без входа — подсказка
// открыть сайт в Safari и кнопка «Скопировать ссылку». Safari мы не открываем:
// iOS открывает https-ссылки в браузере по умолчанию, и схем-обходов нет.
//
// Ссылка на кабинет — /?account=tickets,
// а не #/?account=tickets: переход по хешу внутри уже открытого приложения
// не перезапускает разбор параметра, и кабинет бы не открылся.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconCopy } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../i18n/LangContext';
import { translations } from '../../i18n';
import { generateTicketQR, ticketQrSiteBase } from '../../services/qrService';
import { currentIsIosNonSafari } from '../../utils/iosBrowser';
import { fetchPublicTicket, type PublicTicketLookup } from '../../services/publicTicketService';
import { myTicketsUrl, normalizeTicketCodeInput } from '../../../shared/domain/ticketCode';
import { ticketTypeLabel } from '../../../shared/catalog/ticketTypes';
import type { PublicTicket } from '../../../shared/contracts/ticket';
import styles from './TicketPage.module.scss';

const EN_INSTRUCTION = 'Show this QR code to the theatre staff at the entrance.';
const ACCOUNT_HREF = '/?account=tickets';

type Copy = (typeof translations)['RU']['publicTicket'];

export function TicketPage() {
  const [params] = useSearchParams();
  const { lang: appLang } = useLang();
  // Язык брони приходит в ссылке письма: в новом браузере настройки сайта ещё нет.
  const urlLang = params.get('lang');
  const lang = urlLang === 'FR' || (urlLang !== 'RU' && appLang === 'FR') ? 'FR' : 'RU';
  const t = translations[lang].publicTicket;

  const code = normalizeTicketCodeInput(params.get('code') ?? '');
  const [lookup, setLookup] = useState<PublicTicketLookup | null>(null);
  const [qrSrc, setQrSrc]   = useState('');
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    if (!code) return;
    let stale = false;
    void fetchPublicTicket(code).then(r => { if (!stale) setLookup(r); });
    return () => { stale = true; };
  }, [code]);

  // QR — только действующему билету или когда статус неизвестен.
  const showQr = lookup?.kind === 'unavailable'
    || (lookup?.kind === 'ok' && lookup.ticket.state === 'active');

  useEffect(() => {
    if (!code || !showQr) return;
    let stale = false;
    generateTicketQR(code)
      .then(src => { if (!stale) setQrSrc(src); })
      .catch(() => { if (!stale) setQrFailed(true); });
    return () => { stale = true; };
  }, [code, showQr]);

  if (!code || lookup?.kind === 'invalid') {
    return <Notice title={t.invalidTitle} text={t.invalidText} link={t.myTickets} />;
  }
  if (lookup?.kind === 'not_found') {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Théâtre Tête-à-Tête</p>
        <h1 className={styles.title}>{t.notFoundTitle}</h1>
        <p className={styles.text}>{t.notFoundText}</p>
        <AccountBlock t={t} />
      </main>
    );
  }

  if (!lookup) {
    return (
      <main className={styles.page} aria-busy="true">
        <p className={styles.eyebrow}>Théâtre Tête-à-Tête</p>
        <h1 className={styles.title}>{t.title}</h1>
        <div className={styles.qrCard}>
          <div className={`${styles.qr} ${styles.qrLoading}`} aria-hidden="true" />
          <p className={styles.code}>{code}</p>
        </div>
        <p className={styles.text} role="status">{t.checking}</p>
      </main>
    );
  }

  const ticket = lookup.kind === 'ok' ? lookup.ticket : null;

  if (ticket && ticket.state !== 'active') {
    const { title, text, tone } = inactiveCopy(ticket, t);
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Théâtre Tête-à-Tête</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={`${styles.stamp} ${styles[tone]}`}>{code}</p>
        <TicketDetails ticket={ticket} lang={lang} t={t} />
        <p className={styles.text}>{text}</p>
        <AccountBlock t={t} />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Théâtre Tête-à-Tête</p>
      <h1 className={styles.title}>{t.title}</h1>

      <div className={styles.qrCard}>
        {qrSrc
          ? <img className={styles.qr} src={qrSrc} alt={`QR ${code}`} />
          : <div className={`${styles.qr} ${qrFailed ? styles.qrFailed : styles.qrLoading}`} aria-hidden="true" />}
        <p className={styles.code}>{code}</p>
        <p className={styles.codeLabel}>{t.codeLabel}</p>
      </div>

      <p className={styles.instruction}>{t.instruction}</p>
      <p className={styles.instructionEn}>{EN_INSTRUCTION}</p>
      {qrFailed && <p className={styles.text} role="alert">{t.qrFailed}</p>}
      {!ticket && <p className={styles.text} role="status">{t.statusUnknown}</p>}

      {ticket && <TicketDetails ticket={ticket} lang={lang} t={t} withPayment />}

      <AccountBlock t={t} />
    </main>
  );
}

function inactiveCopy(ticket: PublicTicket, t: Copy): { title: string; text: string; tone: 'stampRed' | 'stampAmber' | 'stampGreen' } {
  switch (ticket.state) {
    case 'refunded':        return { title: t.refundedTitle,  text: t.refundedText,  tone: 'stampRed' };
    case 'attended':        return { title: t.attendedTitle,  text: t.attendedText,  tone: 'stampGreen' };
    case 'payment_pending': return { title: t.pendingTitle,   text: t.pendingText,   tone: 'stampAmber' };
    default:                return { title: t.cancelledTitle, text: t.cancelledText, tone: 'stampRed' };
  }
}

function TicketDetails({ ticket, lang, t, withPayment = false }: {
  ticket: PublicTicket; lang: 'RU' | 'FR'; t: Copy; withPayment?: boolean;
}) {
  const payment = ticket.payment === 'paid'
    ? t.paid
    : ticket.payment === 'transfer'
      ? t.transfer
      : t.onSite(ticket.amountDue ?? 0);
  return (
    <dl className={styles.details}>
      <dt>{t.rowShow}</dt>
      <dd>{ticket.title[lang]}</dd>
      <dt>{t.rowDate}</dt>
      <dd>{ticket.date[lang]}{ticket.time ? ` · ${ticket.time}` : ''}</dd>
      <dt>{t.rowSeats}</dt>
      <dd>{ticket.seats}</dd>
      <dt>{t.rowTickets}</dt>
      <dd>{ticket.lines.map(l => `${l.quantity} × ${ticketTypeLabel(l.type, lang)}`).join(', ')}</dd>
      {withPayment && ticket.payment && (
        <>
          <dt>{t.rowPayment}</dt>
          <dd>{payment}</dd>
        </>
      )}
    </dl>
  );
}

function Notice({ title, text, link }: { title: string; text: string; link: string }) {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Théâtre Tête-à-Tête</p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>{text}</p>
      <a className={styles.secondaryLink} href={ACCOUNT_HREF}>{link}</a>
    </main>
  );
}

/**
 * «Мои билеты и лояльность» — вход в кабинет существующим потоком.
 * Подсказка про Safari — только iPhone/iPad, не Safari и без входа здесь.
 */
function AccountBlock({ t }: { t: Copy }) {
  const { user, loading } = useAuth();
  const [iosOtherBrowser] = useState(currentIsIosNonSafari);
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');
  const accountUrl = myTicketsUrl(ticketQrSiteBase());

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(accountUrl);
      setCopyState('done');
    } catch {
      // Старые встроенные браузеры без Clipboard API — копирование выделением;
      // не вышло и так — ссылка показывается текстом, её можно выделить руками.
      setCopyState(copyBySelection(accountUrl) ? 'done' : 'failed');
    }
  }

  return (
    <div className={styles.account}>
      <a className={styles.accountCta} href={ACCOUNT_HREF}>{t.accountCta}</a>
      {iosOtherBrowser && !loading && !user && (
        <div className={styles.safariHint}>
          <p>{t.safariHint}</p>
          <button type="button" className={styles.copyBtn} onClick={() => void handleCopy()}>
            <IconCopy size={16} stroke={1.5} aria-hidden="true" />
            {t.copyLink}
          </button>
          {copyState === 'done' && <p className={styles.copyNote} role="status">{t.linkCopied}</p>}
          {copyState === 'failed' && (
            <p className={styles.copyNote} role="alert">
              {t.copyFailed} <span className={styles.copyUrl}>{accountUrl}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function copyBySelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity  = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
