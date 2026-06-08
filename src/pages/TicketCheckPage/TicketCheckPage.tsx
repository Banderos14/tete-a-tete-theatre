import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useAuth } from '../../context/AuthContext';
import { getBookingByTicketCode, updateBookingStatus, markBookingPaid } from '../../services/bookingService';
import { parseTicketCodeFromScan } from '../../utils/parseTicketCode';
import type { Booking } from '../../types/booking';
import styles from './TicketCheckPage.module.scss';

type ScanState = 'idle' | 'scanning' | 'loading' | 'found' | 'error';

const IS_DEV = import.meta.env.DEV;

export function TicketCheckPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { userProfile, loading } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const ticketFromUrl = searchParams.get('ticket') ?? '';

  const [scanState,  setScanState]  = useState<ScanState>(ticketFromUrl ? 'loading' : 'idle');
  const [booking,    setBooking]    = useState<Booking | null>(null);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [operating,  setOperating]  = useState(false);
  const scannerRef    = useRef<Html5QrcodeScanner | null>(null);
  const urlLookupDone = useRef(false);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      const t = setTimeout(() => navigate('/'), 1500);
      return () => clearTimeout(t);
    }
  }, [loading, isAdmin, navigate]);

  // ── Auto-lookup when ?ticket= is present in the URL ────────────────────────
  useEffect(() => {
    if (loading || !isAdmin || !ticketFromUrl || urlLookupDone.current) return;
    urlLookupDone.current = true;

    const code = parseTicketCodeFromScan(ticketFromUrl);
    if (IS_DEV) {
      console.log('[TicketCheck] url raw:', ticketFromUrl, '→ parsed:', code);
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
        if (IS_DEV) {
          console.log('[TicketCheck] booking', {
            id: found.id,
            paymentMethod: found.paymentMethod,
            paymentStatus: found.paymentStatus,
            status: found.status,
          });
        }
        setBooking(found);
        setScanState('found');
      })
      .catch(() => {
        setErrorMsg('Ошибка при поиске брони.');
        setScanState('error');
      });
  }, [loading, isAdmin, ticketFromUrl]);

  // ── Camera scanner lifecycle ────────────────────────────────────────────────
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

          if (IS_DEV) console.log('[TicketCheck] raw scan:', text);

          const code = parseTicketCodeFromScan(text);
          if (IS_DEV) console.log('[TicketCheck] parsed:', code);

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
          if (IS_DEV) {
            console.log('[TicketCheck] booking', {
              id: found.id,
              paymentMethod: found.paymentMethod,
              paymentStatus: found.paymentStatus,
              status: found.status,
            });
          }
          setBooking(found);
          setScanState('found');
        } catch {
          setErrorMsg('Ошибка при поиске брони.');
          setScanState('error');
        }
      },
      () => {},
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [scanState]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleCashReceived() {
    if (!booking) return;
    setOperating(true);
    try {
      await markBookingPaid(booking.id);
      setBooking(prev => prev ? { ...prev, paymentStatus: 'paid', status: 'confirmed' } : prev);
    } catch {
      setErrorMsg('Ошибка при подтверждении оплаты.');
      setScanState('error');
    } finally {
      setOperating(false);
    }
  }

  async function handleMarkAttended() {
    if (!booking) return;
    setOperating(true);
    try {
      await updateBookingStatus(booking.id, 'attended');
      setBooking(prev => prev ? { ...prev, status: 'attended' } : prev);
    } catch {
      setErrorMsg('Ошибка при обновлении статуса.');
      setScanState('error');
    } finally {
      setOperating(false);
    }
  }

  function reset() {
    setBooking(null);
    setErrorMsg('');
    setOperating(false);
    setScanState('idle');
    urlLookupDone.current = false;
    if (ticketFromUrl) {
      navigate('/admin/checkin', { replace: true });
    }
  }

  // ── Render guards ────────────────────────────────────────────────────────────
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

  // ── Derived booking flags ─────────────────────────────────────────────────────
  const b = booking;

  const isOnSiteUnpaid       = b?.paymentMethod === 'on_site'       && b.paymentStatus === 'not_paid';
  const isBankTransferUnpaid = b?.paymentMethod === 'bank_transfer'  && b.paymentStatus !== 'paid';
  const isPaidValid          = b?.paymentStatus === 'paid'           && b.status === 'confirmed';
  const isAttended           = b?.status === 'attended';

  function ticketsWord(n: number): string {
    if (n === 1) return 'билет';
    if (n >= 2 && n <= 4) return 'билета';
    return 'билетов';
  }

  function getInvalidReason(): string {
    if (!b) return 'не найден';
    if (b.status === 'cancelled')                 return 'Бронь отменена';
    if (b.paymentStatus === 'expired')            return 'Срок оплаты истёк — бронь аннулирована';
    if (b.paymentStatus === 'awaiting_transfer')  return 'Перевод ещё не получен';
    if (b.paymentStatus !== 'paid')               return 'Билет не оплачен';
    return 'Недействителен';
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>Проверка билетов</h1>
        <button className={styles.backBtn} onClick={() => navigate('/admin')}>
          ← Назад
        </button>
      </div>

      {/* ── Idle ─────────────────────────────────────────────────────────────── */}
      {scanState === 'idle' && !ticketFromUrl && (
        <div className={styles.idleBlock}>
          <p className={styles.hint}>Отсканируйте QR-код билета зрителя.</p>
          <button className={styles.startBtn} onClick={startScanning}>
            Начать сканирование
          </button>
        </div>
      )}

      {/* ── Scanner ──────────────────────────────────────────────────────────── */}
      {scanState === 'scanning' && (
        <div className={styles.scanBlock}>
          <div id="qr-reader" className={styles.qrReader} />
          <button className={styles.cancelBtn} onClick={reset}>Отмена</button>
        </div>
      )}

      {/* ── Spinner ──────────────────────────────────────────────────────────── */}
      {(scanState === 'loading' || operating) && (
        <div className={styles.centered}><span className={styles.spinner} /></div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────────── */}
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

      {/* ── Found ────────────────────────────────────────────────────────────── */}
      {scanState === 'found' && b && !operating && (() => {

        // 1. Билет уже использован ──────────────────────────────────────────────
        if (isAttended) {
          return (
            <div className={styles.cardWrap}>
              <div className={`${styles.card} ${styles.cardUsed}`}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}>⚠️</span>
                  <span className={`${styles.cardStatus} ${styles.cardStatusUsed}`}>
                    БИЛЕТ УЖЕ ИСПОЛЬЗОВАН
                  </span>
                </div>
                <div className={styles.cardDetails}>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Зритель</span>
                    <span className={styles.cardValue}>{b.userName}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Спектакль</span>
                    <span className={styles.cardValue}>{b.showTitle}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Дата</span>
                    <span className={styles.cardValue}>{b.showDate}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Код билета</span>
                    <span className={`${styles.cardValue} ${styles.mono}`}>{b.ticketCode}</span>
                  </div>
                </div>
              </div>
              <div className={styles.actions}>
                <button className={styles.secondaryBtn} onClick={reset}>
                  {ticketFromUrl ? 'К сканеру' : 'Сканировать снова'}
                </button>
              </div>
            </div>
          );
        }

        // 2. on_site, не оплачено — взять наличные ──────────────────────────────
        if (isOnSiteUnpaid) {
          return (
            <div className={styles.cardWrap}>
              <div className={`${styles.card} ${styles.cardValid}`}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}>✅</span>
                  <span className={`${styles.cardStatus} ${styles.cardStatusValid}`}>
                    БИЛЕТ ДЕЙСТВИТЕЛЕН
                  </span>
                </div>
                <div className={styles.cardDetails}>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Зритель</span>
                    <span className={styles.cardValue}>{b.userName}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Спектакль</span>
                    <span className={styles.cardValue}>{b.showTitle}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Дата</span>
                    <span className={styles.cardValue}>{b.showDate}</span>
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
                  {b.totalAmount > 0 && (
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>Сумма</span>
                      <span className={`${styles.cardValue} ${styles.cardValueAmount}`}>
                        {b.totalAmount}&nbsp;€
                      </span>
                    </div>
                  )}
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Оплата</span>
                    <span className={`${styles.cardValue} ${styles.cardValueUnpaid}`}>
                      НЕ ОПЛАЧЕНО — ОПЛАТА НА МЕСТЕ
                    </span>
                  </div>
                </div>
              </div>
              <div className={styles.actions}>
                <button className={styles.cashBtn} onClick={handleCashReceived}>
                  Оплачено
                </button>
                <button className={styles.secondaryBtn} onClick={reset}>
                  {ticketFromUrl ? 'К сканеру' : 'Сканировать снова'}
                </button>
              </div>
            </div>
          );
        }

        // 3. Оплачен и подтверждён — разрешить вход ─────────────────────────────
        if (isPaidValid) {
          return (
            <div className={styles.cardWrap}>
              <div className={`${styles.card} ${styles.cardValid}`}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardIcon}>✅</span>
                  <span className={`${styles.cardStatus} ${styles.cardStatusValid}`}>
                    БИЛЕТ ДЕЙСТВИТЕЛЕН
                  </span>
                </div>
                <div className={styles.cardDetails}>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Зритель</span>
                    <span className={styles.cardValue}>{b.userName}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Спектакль</span>
                    <span className={styles.cardValue}>{b.showTitle}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Дата</span>
                    <span className={styles.cardValue}>{b.showDate}</span>
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
                    <span className={styles.cardValue}>Оплачено</span>
                  </div>
                </div>
              </div>
              <div className={styles.actions}>
                <button className={styles.markBtn} onClick={handleMarkAttended}>
                  Отметить посещение
                </button>
                <button className={styles.secondaryBtn} onClick={reset}>
                  {ticketFromUrl ? 'К сканеру' : 'Сканировать снова'}
                </button>
              </div>
            </div>
          );
        }

        // 4 + 5. Недействителен (bank_transfer не оплачен / отменён / прочее) ───
        return (
          <div className={styles.cardWrap}>
            <div className={`${styles.card} ${styles.cardInvalid}`}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>❌</span>
                <span className={`${styles.cardStatus} ${styles.cardStatusInvalid}`}>
                  БИЛЕТ НЕ ДЕЙСТВИТЕЛЕН
                </span>
              </div>
              <div className={styles.cardDetails}>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Зритель</span>
                  <span className={styles.cardValue}>{b.userName}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Спектакль</span>
                  <span className={styles.cardValue}>{b.showTitle}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Код билета</span>
                  <span className={`${styles.cardValue} ${styles.mono}`}>{b.ticketCode}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Причина</span>
                  <span className={`${styles.cardValue} ${styles.cardValueReason}`}>
                    {isBankTransferUnpaid ? 'Перевод ещё не получен' : getInvalidReason()}
                  </span>
                </div>
              </div>
            </div>
            <div className={styles.actions}>
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
