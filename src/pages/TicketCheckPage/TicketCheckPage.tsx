import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useAuth } from '../../context/AuthContext';
import { getBookingByTicketCode, updateBookingStatus } from '../../services/bookingService';
import { parseTicketCodeFromScan } from '../../utils/parseTicketCode';
import type { Booking } from '../../types/booking';
import styles from './TicketCheckPage.module.scss';

type ScanState = 'idle' | 'scanning' | 'loading' | 'found' | 'marking' | 'done' | 'error';
type CardVariant = 'valid' | 'invalid' | 'used';

const IS_DEV = import.meta.env.DEV;

export function TicketCheckPage() {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const { userProfile, loading } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  // React Router (HashRouter) already extracts the ticket value from the hash search string
  const ticketFromUrl = searchParams.get('ticket') ?? '';

  // Start in loading state immediately if ticket is in URL — avoids idle flash
  const [scanState, setScanState] = useState<ScanState>(ticketFromUrl ? 'loading' : 'idle');
  const [booking,   setBooking]   = useState<Booking | null>(null);
  const [errorMsg,  setErrorMsg]  = useState('');
  const scannerRef    = useRef<Html5QrcodeScanner | null>(null);
  const urlLookupDone = useRef(false);

  // ── Auth guard ──
  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      const t = setTimeout(() => navigate('/'), 1500);
      return () => clearTimeout(t);
    }
  }, [loading, isAdmin, navigate]);

  // ── Auto-lookup when ?ticket= is present in the URL ──
  useEffect(() => {
    if (loading || !isAdmin || !ticketFromUrl || urlLookupDone.current) return;
    urlLookupDone.current = true;

    const code = parseTicketCodeFromScan(ticketFromUrl);
    if (IS_DEV) {
      console.log('[TicketCheck] url raw:', ticketFromUrl);
      console.log('[TicketCheck] parsed ticketCode:', code);
    }

    if (!code) {
      setErrorMsg('QR-код не похож на билет Théâtre Tête-à-Tête.');
      setScanState('error');
      return;
    }

    setScanState('loading');
    getBookingByTicketCode(code)
      .then(found => {
        if (!found) {
          setErrorMsg(`Билет с кодом ${code} не найден.`);
          setScanState('error');
          return;
        }
        setBooking(found);
        setScanState('found');
      })
      .catch(() => {
        setErrorMsg('Ошибка при поиске брони.');
        setScanState('error');
      });
  }, [loading, isAdmin, ticketFromUrl]);

  // ── Camera scanner lifecycle ──
  function startScanning() {
    setScanState('scanning');
    setBooking(null);
    setErrorMsg('');
  }

  useEffect(() => {
    if (scanState !== 'scanning') return;

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false,
    );
    scannerRef.current = scanner;

    scanner.render(
      async (text) => {
        try {
          scanner.clear();
          scannerRef.current = null;
          setScanState('loading');

          if (IS_DEV) {
            console.log('[TicketCheck] raw scan:', text);
          }

          const code = parseTicketCodeFromScan(text);

          if (IS_DEV) {
            console.log('[TicketCheck] parsed ticketCode:', code);
          }

          if (!code) {
            setErrorMsg('QR-код не похож на билет Théâtre Tête-à-Tête.');
            setScanState('error');
            return;
          }

          const found = await getBookingByTicketCode(code);
          if (!found) {
            setErrorMsg(`Билет с кодом ${code} не найден.`);
            setScanState('error');
            return;
          }
          setBooking(found);
          setScanState('found');
        } catch {
          setErrorMsg('Ошибка при поиске брони.');
          setScanState('error');
        }
      },
      () => { /* per-frame errors — ignored */ },
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [scanState]);

  // ── Actions ──
  async function handleMarkAttended() {
    if (!booking) return;
    setScanState('marking');
    try {
      await updateBookingStatus(booking.id, 'attended');
      setBooking(prev => prev ? { ...prev, status: 'attended' } : prev);
      setScanState('done');
    } catch {
      setErrorMsg('Ошибка при обновлении статуса.');
      setScanState('error');
    }
  }

  function reset() {
    setBooking(null);
    setErrorMsg('');
    setScanState('idle');
    urlLookupDone.current = false;
    if (ticketFromUrl) {
      navigate('/admin/checkin', { replace: true });
    }
  }

  // ── Render guards ──
  if (loading) {
    return <div className={styles.centered}><span className={styles.spinner} /></div>;
  }

  if (!isAdmin) {
    return (
      <div className={styles.centered}>
        <p className={styles.accessDenied}>
          {ticketFromUrl
            ? 'Для проверки билета войдите как администратор'
            : 'Доступ запрещён'}
        </p>
      </div>
    );
  }

  const b           = booking;
  const isPaid      = b?.paymentStatus === 'paid';
  const isCancelled = b?.status === 'cancelled';
  const isAttended  = b?.status === 'attended';
  const isValid     = isPaid && b?.status === 'confirmed';
  const markedNow   = scanState === 'done';

  function getCardVariant(): CardVariant {
    if (!b) return 'invalid';
    if (isAttended || markedNow) return 'used';
    if (isValid) return 'valid';
    return 'invalid';
  }

  function getInvalidReason(): string {
    if (!b) return 'не найден';
    if (isCancelled) return 'Бронь отменена';
    if (!isPaid) return 'Билет не оплачен';
    return 'Недействителен';
  }

  function ticketsWord(n: number): string {
    if (n === 1) return 'билет';
    if (n >= 2 && n <= 4) return 'билета';
    return 'билетов';
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>Проверка билетов</h1>
        <button className={styles.backBtn} onClick={() => navigate('/admin')}>
          ← Назад
        </button>
      </div>

      {/* ── Idle (scanner mode — only when no ticket in URL) ── */}
      {scanState === 'idle' && !ticketFromUrl && (
        <div className={styles.idleBlock}>
          <p className={styles.hint}>Отсканируйте QR-код билета зрителя.</p>
          <button className={styles.startBtn} onClick={startScanning}>
            Начать сканирование
          </button>
        </div>
      )}

      {/* ── Scanner ── */}
      {scanState === 'scanning' && (
        <div className={styles.scanBlock}>
          <div id="qr-reader" className={styles.qrReader} />
          <button className={styles.cancelBtn} onClick={reset}>Отмена</button>
        </div>
      )}

      {/* ── Loading ── */}
      {scanState === 'loading' && (
        <div className={styles.centered}><span className={styles.spinner} /></div>
      )}

      {/* ── Error (ticket not found or unrecognized QR) ── */}
      {scanState === 'error' && (
        <div className={styles.cardWrap}>
          <div className={`${styles.card} ${styles.cardInvalid}`}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>❌</span>
              <span className={`${styles.cardStatus} ${styles.cardStatusInvalid}`}>
                БИЛЕТ НЕ ДЕЙСТВИТЕЛЕН
              </span>
            </div>
            <div className={styles.cardReason}>{errorMsg}</div>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondaryBtn} onClick={reset}>
              {ticketFromUrl ? 'К сканеру' : 'Сканировать снова'}
            </button>
          </div>
        </div>
      )}

      {/* ── Found / Marking / Done ── */}
      {(scanState === 'found' || scanState === 'marking' || scanState === 'done') && b && (() => {
        const variant = getCardVariant();
        const variantClass =
          variant === 'valid' ? styles.cardValid :
          variant === 'used'  ? styles.cardUsed  :
          styles.cardInvalid;
        const statusClass =
          variant === 'valid' ? styles.cardStatusValid :
          variant === 'used'  ? styles.cardStatusUsed  :
          styles.cardStatusInvalid;

        return (
          <div className={styles.cardWrap}>
            <div className={`${styles.card} ${variantClass}`}>
              {/* Header */}
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>
                  {variant === 'valid' ? '✅' : variant === 'used' ? '⚠️' : '❌'}
                </span>
                <span className={`${styles.cardStatus} ${statusClass}`}>
                  {variant === 'valid' ? 'БИЛЕТ ДЕЙСТВИТЕЛЕН'    :
                   variant === 'used'  ? 'БИЛЕТ УЖЕ ИСПОЛЬЗОВАН' :
                                         'БИЛЕТ НЕ ДЕЙСТВИТЕЛЕН'}
                </span>
              </div>

              {/* Details */}
              <div className={styles.cardDetails}>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Спектакль</span>
                  <span className={styles.cardValue}>{b.showTitle}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Дата</span>
                  <span className={styles.cardValue}>{b.showDate}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Время</span>
                  <span className={styles.cardValue}>{b.showTime}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Код билета</span>
                  <span className={`${styles.cardValue} ${styles.mono}`}>{b.ticketCode}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Количество</span>
                  <span className={styles.cardValue}>
                    {b.ticketsCount} {ticketsWord(b.ticketsCount)}
                  </span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Оплата</span>
                  <span className={styles.cardValue}>
                    {b.paymentStatus === 'paid'              ? 'Оплачено'          :
                     b.paymentStatus === 'awaiting_transfer' ? 'Ожидает перевода'  :
                                                               'Не оплачено'}
                  </span>
                </div>
                {variant === 'invalid' && (
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Причина</span>
                    <span className={`${styles.cardValue} ${styles.cardValueReason}`}>
                      {getInvalidReason()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className={styles.actions}>
              {markedNow && (
                <div className={styles.markedBanner}>✅ Посещение отмечено</div>
              )}
              {isValid && !markedNow && (
                <button
                  className={styles.markBtn}
                  onClick={handleMarkAttended}
                  disabled={scanState === 'marking'}
                >
                  {scanState === 'marking' ? '…' : 'Отметить посещение'}
                </button>
              )}
              <button className={styles.secondaryBtn} onClick={reset}>
                {ticketFromUrl ? 'К сканеру' : 'Сканировать снова'}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
