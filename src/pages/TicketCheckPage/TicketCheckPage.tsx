import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../../context/AuthContext';
import { getBookingByTicketCode, updateBookingStatus, markBookingPaid } from '../../services/bookingService';
import { parseTicketCodeFromScan } from '../../utils/parseTicketCode';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import type { Booking } from '../../types/booking';
import styles from './TicketCheckPage.module.scss';

// Конвертирует первую страницу PDF в PNG для сканирования QR.
// pdfjs-dist загружается лениво — только когда пользователь выбирает PDF.
async function convertPdfFirstPageToImageFile(pdfFile: File): Promise<File> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;

  const bytes = await pdfFile.arrayBuffer();
  const doc   = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page  = await doc.getPage(1);

  // Scale 2.5: QR-код получается достаточно большим для надёжного распознавания
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;

  await page.render({ canvas, viewport }).promise;

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      blob => blob
        ? resolve(new File([blob], 'ticket-page.png', { type: 'image/png' }))
        : reject(new Error('canvas.toBlob returned null')),
      'image/png',
    );
  });
}

type ScanState = 'idle' | 'scanning' | 'loading' | 'found' | 'error';

export function TicketCheckPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { userProfile, loading } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const ticketFromUrl = searchParams.get('ticket') ?? '';

  type ConfirmType = 'cash' | 'attended' | null;

  const [scanState,    setScanState]    = useState<ScanState>(ticketFromUrl ? 'loading' : 'idle');
  const [booking,      setBooking]      = useState<Booking | null>(null);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [operating,    setOperating]    = useState(false);
  const [confirmType,  setConfirmType]  = useState<ConfirmType>(null);
  const [cameraError,  setCameraError]  = useState('');
  const scannerRef    = useRef<Html5Qrcode | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const urlLookupDone = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      const t = setTimeout(() => navigate('/'), 1500);
      return () => clearTimeout(t);
    }
  }, [loading, isAdmin, navigate]);

  // Защищает от двойного запроса при StrictMode.
  useEffect(() => {
    if (loading || !isAdmin || !ticketFromUrl || urlLookupDone.current) return;
    urlLookupDone.current = true;

    let cancelled = false;

    const lookup = async () => {
      const code = parseTicketCodeFromScan(ticketFromUrl);
      await Promise.resolve();
      if (cancelled) return;

      if (!code) {
        setErrorMsg('QR-код не похож на билет Théâtre Tête-à-Tête.');
        setScanState('error');
        return;
      }

      setScanState('loading');
      try {
        const found = await getBookingByTicketCode(code);
        if (cancelled) return;
        if (!found) {
          setErrorMsg(`Билет с кодом ${code} не найден.`);
          setScanState('error');
          return;
        }
        setBooking(found);
        setScanState('found');
      } catch {
        if (cancelled) return;
        setErrorMsg('Ошибка при поиске брони.');
        setScanState('error');
      }
    };

    void lookup();
    return () => { cancelled = true; };
  }, [loading, isAdmin, ticketFromUrl]);

  function startScanning() {
    setCameraError('');
    setBooking(null);
    setErrorMsg('');
    setScanState('scanning');
  }

  useEffect(() => {
    if (scanState !== 'scanning') return;

    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (text) => {
        try {
          if (scannerRef.current) {
            await scannerRef.current.stop();
            scannerRef.current = null;
          }
          setScanState('loading');

          const code = parseTicketCodeFromScan(text);

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
      () => {},
    ).catch((err) => {
      scannerRef.current = null;
      scanner.clear();
      const msg = String(err).toLowerCase();
      setCameraError(
        msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')
          ? 'Для проверки билетов необходимо разрешить доступ к камере.'
          : 'Не удалось запустить камеру. Попробуйте ещё раз.',
      );
      setScanState('idle');
    });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    };
  }, [scanState]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setScanState('loading');

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    let scanFile = file;
    if (isPdf) {
      try {
        scanFile = await convertPdfFirstPageToImageFile(file);
      } catch {
        setErrorMsg('Не удалось прочитать PDF. Убедитесь, что файл не повреждён.');
        setScanState('error');
        return;
      }
    }

    const scanner = new Html5Qrcode('qr-file-scanner');
    try {
      const text = await scanner.scanFile(scanFile, false);
      scanner.clear();

      const code = parseTicketCodeFromScan(text);
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
      scanner.clear();
      setErrorMsg(
        isPdf
          ? 'QR-код не найден в PDF-файле.'
          : 'Не удалось распознать QR-код в изображении.',
      );
      setScanState('error');
    }
  }

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
    setCameraError('');
    setScanState('idle');
    urlLookupDone.current = false;
    if (ticketFromUrl) {
      navigate('/admin/checkin', { replace: true });
    }
  }

  if (loading) {
    return <div className={styles.centered}><span className={styles.spinner} /></div>;
  }

  if (!isAdmin) {
    return (
      <div className={styles.centered}>
        <p className={styles.accessDenied}>
          {ticketFromUrl
            ? 'Для проверки билетов войдите как администратор'
            : 'Доступ запрещён'}
        </p>
      </div>
    );
  }

  // Сценарии проверки билета: использован, оплата на месте, валиден или недействителен.
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
      {/* Контейнер нужен html5-qrcode для сканирования из файла. */}
      <div id="qr-file-scanner" style={{ display: 'none' }} />

      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>Проверка билетов</h1>
        <button className={styles.backBtn} onClick={() => navigate('/admin')}>
          ← Назад
        </button>
      </div>

      {scanState === 'idle' && !ticketFromUrl && (
        <div className={styles.idleBlock}>
          <div className={styles.qrIconWrap}>
            <QrScanIcon />
          </div>

          <p className={styles.scanTitle}>СКАНИРОВАНИЕ БИЛЕТА</p>
          <p className={styles.scanHint}>
            Наведите камеру на QR-код, выберите изображение или PDF-файл билета
          </p>

          {cameraError && (
            <div className={styles.cameraErrorBox}>
              <span className={styles.cameraErrorSign}>🚫</span>
              {cameraError}
            </div>
          )}

          <div className={styles.scanActions}>
            <button className={styles.scanStartBtn} onClick={startScanning}>
              <CameraIcon />
              {cameraError ? 'Попробовать снова' : 'Сканировать QR-код'}
            </button>
            <button
              className={styles.scanFileBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon />
              Изображение или PDF
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
            aria-label="Изображение или PDF билета"
          />
        </div>
      )}

      {scanState === 'scanning' && (
        <div className={styles.scanBlock}>
          <p className={styles.scanActiveHint}>Наведите QR-код в рамку</p>
          <div id="qr-reader" className={styles.qrReader} />
          <button className={styles.cancelBtn} onClick={reset}>Отмена</button>
        </div>
      )}

      {(scanState === 'loading' || operating) && (
        <div className={styles.centered}><span className={styles.spinner} /></div>
      )}

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

      {scanState === 'found' && b && !operating && (() => {

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
                <button className={styles.cashBtn} onClick={() => setConfirmType('cash')}>
                  Оплачено
                </button>
                <button className={styles.secondaryBtn} onClick={reset}>
                  {ticketFromUrl ? 'К сканеру' : 'Сканировать снова'}
                </button>
              </div>
            </div>
          );
        }

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
                <button className={styles.markBtn} onClick={() => setConfirmType('attended')}>
                  Отметить посещение
                </button>
                <button className={styles.secondaryBtn} onClick={reset}>
                  {ticketFromUrl ? 'К сканеру' : 'Сканировать снова'}
                </button>
              </div>
            </div>
          );
        }

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
      <ConfirmDialog
        isOpen={confirmType === 'cash'}
        title="Подтвердить оплату?"
        message="Вы уверены, что хотите отметить эту бронь как оплаченную? Это изменит статус оплаты."
        confirmLabel="Да, оплату получили"
        cancelLabel="Отмена"
        loading={operating}
        onCancel={() => setConfirmType(null)}
        onConfirm={() => {
          setConfirmType(null);
          handleCashReceived();
        }}
      />

      <ConfirmDialog
        isOpen={confirmType === 'attended'}
        title="Отметить посещение?"
        message="Вы уверены, что зритель прошёл в зал? После этого билет будет считаться использованным."
        confirmLabel="Да, отметить посещение"
        cancelLabel="Отмена"
        loading={operating}
        onCancel={() => setConfirmType(null)}
        onConfirm={() => {
          setConfirmType(null);
          handleMarkAttended();
        }}
      />
    </div>
  );
}

function QrScanIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 14h2v2h-2zM18 14h3M14 18h2M18 18h3v3M18 18v2"/>
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  );
}
