import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useAuth } from '../../context/AuthContext';
import { getBookingByTicketCode, updateBookingStatus } from '../../services/bookingService';
import type { Booking } from '../../types/booking';
import styles from './TicketCheckPage.module.scss';

type ScanState = 'idle' | 'scanning' | 'loading' | 'found' | 'marking' | 'done' | 'error';

export function TicketCheckPage() {
  const navigate = useNavigate();
  const { userProfile, loading } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [booking,   setBooking]   = useState<Booking | null>(null);
  const [errorMsg,  setErrorMsg]  = useState('');
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      const t = setTimeout(() => navigate('/'), 1500);
      return () => clearTimeout(t);
    }
  }, [loading, isAdmin, navigate]);

  function startScanning() {
    setScanState('scanning');
    setBooking(null);
    setErrorMsg('');
  }

  useEffect(() => {
    if (scanState !== 'scanning') return;

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
      false,
    );

    scannerRef.current = scanner;

    scanner.render(
      async (text) => {
        try {
          scanner.clear();
          scannerRef.current = null;
          setScanState('loading');

          let ticketCode = text.trim();
          try {
            const parsed = JSON.parse(text) as { ticketCode?: string };
            if (parsed.ticketCode) ticketCode = parsed.ticketCode;
          } catch {
            // raw ticketCode, use as-is
          }

          const found = await getBookingByTicketCode(ticketCode);
          if (!found) {
            setErrorMsg(`Бронь с кодом «${ticketCode}» не найдена.`);
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
  }

  if (loading) {
    return <div className={styles.centered}><span className={styles.spinner} /></div>;
  }

  if (!isAdmin) {
    return (
      <div className={styles.centered}>
        <p className={styles.accessDenied}>Доступ запрещён</p>
      </div>
    );
  }

  const b = booking;
  const isPaid      = b?.paymentStatus === 'paid';
  const isCancelled = b?.status === 'cancelled';
  const isAttended  = b?.status === 'attended';
  const isValid     = isPaid && b?.status === 'confirmed';

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>Проверка билетов</h1>
        <button className={styles.backBtn} onClick={() => navigate('/admin')}>
          ← Назад
        </button>
      </div>

      {/* ── Idle ── */}
      {scanState === 'idle' && (
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

      {/* ── Error ── */}
      {scanState === 'error' && (
        <div className={styles.resultBlock}>
          <div className={styles.statusBadge + ' ' + styles.statusInvalid}>Ошибка</div>
          <p className={styles.errorMsg}>{errorMsg}</p>
          <button className={styles.startBtn} onClick={reset}>Сканировать снова</button>
        </div>
      )}

      {/* ── Found ── */}
      {(scanState === 'found' || scanState === 'marking' || scanState === 'done') && b && (
        <div className={styles.resultBlock}>

          {/* Status banner */}
          {!isPaid && (
            <div className={`${styles.statusBadge} ${styles.statusInvalid}`}>Билет не оплачен</div>
          )}
          {isPaid && isCancelled && (
            <div className={`${styles.statusBadge} ${styles.statusInvalid}`}>Билет отменён</div>
          )}
          {isPaid && isAttended && (
            <div className={`${styles.statusBadge} ${styles.statusUsed}`}>Билет уже использован</div>
          )}
          {scanState === 'done' && (
            <div className={`${styles.statusBadge} ${styles.statusDone}`}>Посещение отмечено ✓</div>
          )}
          {isValid && scanState === 'found' && (
            <div className={`${styles.statusBadge} ${styles.statusOk}`}>Билет действителен</div>
          )}

          {/* Booking details */}
          <div className={styles.details}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Зритель</span>
              <span className={styles.detailValue}>{b.userName}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Email</span>
              <span className={styles.detailValue}>{b.userEmail}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Спектакль</span>
              <span className={styles.detailValue}>{b.showTitle}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Дата</span>
              <span className={styles.detailValue}>{b.showDate} · {b.showTime}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Код брони</span>
              <span className={`${styles.detailValue} ${styles.mono}`}>{b.ticketCode}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Оплата</span>
              <span className={styles.detailValue}>
                {b.paymentStatus === 'paid'              ? 'Оплачено'          :
                 b.paymentStatus === 'awaiting_transfer' ? 'Ожидает перевода'  :
                                                           'Не оплачено'}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Статус брони</span>
              <span className={styles.detailValue}>
                {b.status === 'confirmed' ? 'Подтверждена' :
                 b.status === 'attended'  ? 'Посещено'     :
                 b.status === 'cancelled' ? 'Отменена'     :
                                            'Ожидает'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            {isValid && scanState === 'found' && (
              <button
                className={styles.markBtn}
                onClick={handleMarkAttended}
                disabled={scanState !== 'found'}
              >
                Отметить посещение
              </button>
            )}
            {scanState !== 'marking' && (
              <button className={styles.cancelBtn} onClick={reset}>
                Сканировать снова
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
