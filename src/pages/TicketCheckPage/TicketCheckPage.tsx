// Проверка билетов на входе. Этот файл — оболочка: гейт доступа и экраны по
// состоянию сканирования. Логика проверки живёт в useTicketCheck, работа с
// камерой и файлами — в useQrScanner, карточка результата — в TicketResultCard.

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useTicketCheck } from './useTicketCheck';
import { useCameraScanner, scanTicketFile, CAMERA_ELEMENT_ID, FILE_SCANNER_ELEMENT_ID } from './useQrScanner';
import { CheckinAuthGate } from './CheckinAuthGate';
import { TicketResultCard, ScanErrorCard } from './TicketResultCard';
import { GroupResultCard } from './GroupResultCard';
import { GroupConfirmSheet } from './GroupConfirmSheet';
import type { CheckinBooking } from '../../services/checkinService';
import { QrScanIcon, CameraIcon, ImageIcon } from './ScanIcons';
import styles from './TicketCheckPage.module.scss';

/** Через сколько не-админа без кода в адресе уводит на лендинг, мс. */
const REDIRECT_DELAY_MS = 1500;

type ConfirmType = 'cash' | 'attended' | 'group' | null;

export function TicketCheckPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userProfile, loading, signInWithEmail, signInWithGoogle } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const ticketFromUrl = searchParams.get('ticket') ?? '';

  const check = useTicketCheck(user, ticketFromUrl ? 'loading' : 'idle');
  useCameraScanner(check);

  const [confirmType, setConfirmType] = useState<ConfirmType>(null);
  // Бронь группы, по которой открыт одиночный диалог; null — отсканированная.
  const [confirmTarget, setConfirmTarget] = useState<CheckinBooking | null>(null);

  function askConfirm(type: ConfirmType, target: CheckinBooking | null = null) {
    setConfirmTarget(target);
    setConfirmType(type);
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Код из адреса разбирается один раз: без флага StrictMode слал бы два запроса.
  const urlLookupDone = useRef(false);

  useEffect(() => {
    if (loading) return;
    // Если в адресе есть код билета — НЕ уводим со страницы. Сотрудник на входе
    // отсканировал QR; выбросить его на главную значит потерять код и заставить
    // сканировать заново. Вместо редиректа показываем вход прямо здесь.
    if (!isAdmin && !ticketFromUrl) {
      const t = setTimeout(() => navigate('/'), REDIRECT_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [loading, isAdmin, navigate, ticketFromUrl]);

  const { lookupByCode } = check;
  useEffect(() => {
    if (loading || !isAdmin || !ticketFromUrl || urlLookupDone.current) return;
    urlLookupDone.current = true;
    void lookupByCode(ticketFromUrl);
  }, [loading, isAdmin, ticketFromUrl, lookupByCode]);

  function handleReset() {
    check.reset();
    urlLookupDone.current = false;
    if (ticketFromUrl) navigate('/admin/checkin', { replace: true });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';
    await scanTicketFile(file, check);
  }

  if (loading) {
    return <div className={styles.centered}><span className={styles.spinner} /></div>;
  }

  if (!isAdmin) {
    // Кода билета в адресе нет — обычный отказ, эффект выше уводит на главную.
    if (!ticketFromUrl) {
      return (
        <div className={styles.centered}>
          <p className={styles.accessDenied}>Доступ запрещён</p>
        </div>
      );
    }
    return (
      <CheckinAuthGate
        user={user}
        ticketFromUrl={ticketFromUrl}
        signInWithEmail={signInWithEmail}
        signInWithGoogle={signInWithGoogle}
      />
    );
  }

  const resetLabel = ticketFromUrl ? 'К сканеру' : 'Сканировать снова';

  return (
    <div className={styles.page}>
      {/* Контейнер нужен html5-qrcode для сканирования из файла. */}
      <div id={FILE_SCANNER_ELEMENT_ID} style={{ display: 'none' }} />

      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>Проверка билетов</h1>
        <button className={styles.backBtn} onClick={() => navigate('/admin')}>
          ← Назад
        </button>
      </div>

      {check.scanState === 'idle' && !ticketFromUrl && (
        <div className={styles.idleBlock}>
          <div className={styles.qrIconWrap}>
            <QrScanIcon />
          </div>

          <p className={styles.scanTitle}>СКАНИРОВАНИЕ БИЛЕТА</p>
          <p className={styles.scanHint}>
            Наведите камеру на QR-код, выберите изображение или PDF-файл билета
          </p>

          {check.cameraError && (
            <div className={styles.cameraErrorBox}>
              <span className={styles.cameraErrorSign}>🚫</span>
              {check.cameraError}
            </div>
          )}

          <div className={styles.scanActions}>
            <button className={styles.scanStartBtn} onClick={check.beginScanning}>
              <CameraIcon />
              {check.cameraError ? 'Попробовать снова' : 'Сканировать QR-код'}
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

      {check.scanState === 'scanning' && (
        <div className={styles.scanBlock}>
          <p className={styles.scanActiveHint}>Наведите QR-код в рамку</p>
          <div id={CAMERA_ELEMENT_ID} className={styles.qrReader} />
          <button className={styles.cancelBtn} onClick={handleReset}>Отмена</button>
        </div>
      )}

      {(check.scanState === 'loading' || check.operating) && (
        <div className={styles.centered}><span className={styles.spinner} /></div>
      )}

      {check.scanState === 'error' && (
        <ScanErrorCard message={check.errorMsg} onReset={handleReset} resetLabel={resetLabel} />
      )}

      {/* Несколько активных броней зрителя на этот сеанс — показываем их вместе.
          Одна бронь остаётся в прежней одиночной карточке. */}
      {check.scanState === 'found' && check.booking && check.group && !check.operating && (
        <GroupResultCard
          group={check.group}
          onGroupCheckIn={() => askConfirm('group')}
          onCashReceived={b => askConfirm('cash', b)}
          onMarkAttended={b => askConfirm('attended', b)}
          onReset={handleReset}
          resetLabel={resetLabel}
        />
      )}

      {check.scanState === 'found' && check.booking && !check.group && !check.operating && (
        <TicketResultCard
          booking={check.booking}
          onReset={handleReset}
          resetLabel={resetLabel}
          onCashReceived={() => askConfirm('cash')}
          onMarkAttended={() => askConfirm('attended')}
        />
      )}

      <ConfirmDialog
        isOpen={confirmType === 'cash'}
        title="Подтвердить оплату?"
        message="Вы уверены, что хотите отметить эту бронь как оплаченную? Это изменит статус оплаты."
        confirmLabel="Да, оплату получили"
        cancelLabel="Отмена"
        loading={check.operating}
        onCancel={() => setConfirmType(null)}
        onConfirm={() => {
          setConfirmType(null);
          void check.markPaid(confirmTarget ?? undefined);
        }}
      />

      <ConfirmDialog
        isOpen={confirmType === 'attended'}
        title="Отметить посещение?"
        message="Вы уверены, что зритель прошёл в зал? После этого билет будет считаться использованным."
        confirmLabel="Да, отметить посещение"
        cancelLabel="Отмена"
        loading={check.operating}
        onCancel={() => setConfirmType(null)}
        onConfirm={() => {
          setConfirmType(null);
          void check.markAttended(confirmTarget ?? undefined);
        }}
      />

      <GroupConfirmSheet
        group={check.group}
        isOpen={confirmType === 'group'}
        onCancel={() => setConfirmType(null)}
        onConfirm={() => {
          setConfirmType(null);
          void check.checkInGroup();
        }}
      />
    </div>
  );
}
