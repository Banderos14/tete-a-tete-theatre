// Личный кабинет зрителя. Этот файл — только оболочка: a11y модалки, раскладка
// и переключение разделов. Форма профиля живёт в useProfileForm, брони —
// в useProfileBookings, а содержимое разделов — в соседних *Section-файлах.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { useProfileForm } from './useProfileForm';
import { useProfileBookings } from './useProfileBookings';
import { FORM_SECTIONS, MOBILE_TAB_SECTION, type MobileTab, type Section } from './sections';
import { ProfileSidebar, type NavItem } from './ProfileSidebar';
import { ProfileMobileHeader, ProfileMobileTabBar } from './ProfileMobileHeader';
import { PersonalSection } from './PersonalSection';
import { ContactsSection } from './ContactsSection';
import { SocialsSection, NotificationsSection, SettingsSection } from './SettingsSections';
import { TicketsSection } from './TicketsSection';
import { AttendedSection } from './AttendedSection';
import styles from './ProfileDrawer.module.scss';

/** Сколько держится подсветка незаполненного обязательного поля, мс. */
const PULSE_MS = 2100;
/** Сколько висит предупреждение о несохранённых изменениях, мс. */
const UNSAVED_TOAST_MS = 2500;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileDrawer({ open, onClose }: Props) {
  const { lang, t } = useLang();
  const { user, userProfile, loading, logout } = useAuth();

  const form     = useProfileForm();
  const tickets  = useProfileBookings(open, user, lang);

  const [activeSection,    setActiveSection]    = useState<Section>('personal');
  const [activeMobileTab,  setActiveMobileTab]  = useState<MobileTab>('profile');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  const [warnVisible, setWarnVisible] = useState(false);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [pulseBirthday, setPulseBirthday] = useState(false);
  const [pulsePhone,    setPulsePhone]    = useState(false);

  useScrollLock(open);

  // Сворачиваем раскрытый билет при смене раздела
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedTicketId(null);
  }, [activeSection]);

  // Pulse-анимация для незаполненных обязательных полей при смене раздела
  useEffect(() => {
    if (activeSection === 'personal' && !form.birthday) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPulseBirthday(true);
      const timer = setTimeout(() => setPulseBirthday(false), PULSE_MS);
      return () => clearTimeout(timer);
    }
    setPulseBirthday(false);
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((activeSection === 'contacts' || activeSection === 'personal') && !form.phone.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPulsePhone(true);
      const timer = setTimeout(() => setPulsePhone(false), PULSE_MS);
      return () => clearTimeout(timer);
    }
    setPulsePhone(false);
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  function tryClose() {
    if (form.isDirty) {
      setWarnVisible(true);
      clearTimeout(warnTimer.current);
      warnTimer.current = setTimeout(() => setWarnVisible(false), UNSAVED_TOAST_MS);
    } else {
      // Blur before onClose to prevent "aria-hidden on element with focused descendant" warning.
      (document.activeElement as HTMLElement)?.blur();
      onClose();
    }
  }

  // Escape, начальный фокус, удержание фокуса и возврат его инициатору.
  // Закрываем через tryClose, чтобы не потерять несохранённые изменения:
  // при них показывается предупреждение вместо закрытия.
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalA11y(open, tryClose, dialogRef);

  // Десктопный сабмит: при ошибке уводим в тот раздел, где её видно.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = await form.save({ withValidation: true });
    if (errs.displayName || errs.birthday) setActiveSection('personal');
    else if (errs.phone)                   setActiveSection('contacts');
  }

  async function handleLogout() {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
    await logout();
  }

  function setMobileTab(tab: MobileTab) {
    setActiveMobileTab(tab);
    setActiveSection(MOBILE_TAB_SECTION[tab]);
  }

  const headerName = form.displayName || user?.displayName || userProfile?.displayName || '';
  const email      = user?.email ?? userProfile?.email ?? '';
  const photoURL   = user?.photoURL ?? null;
  const regYear    = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).getFullYear()
    : null;
  const isGoogleProvider = user?.providerData?.some(p => p.providerId === 'google.com') ?? false;
  const googleLabel = lang === 'FR' ? 'via Google' : 'через Google';

  const navItems: NavItem[] = [
    { id: 'personal',      label: t.profile.sectionPersonal,      warning: form.missingBirthday },
    { id: 'contacts',      label: t.profile.sectionContacts,      warning: form.missingPhone    },
    { id: 'socials',       label: t.profile.sectionSocials       },
    { id: 'notifications', label: t.profile.sectionNotifications },
    { id: 'tickets',       label: t.profile.history,              badge: tickets.ticketCount || undefined },
    { id: 'shows',         label: t.profile.historyAttended      },
  ];

  if (open && loading) {
    return (
      <div className={`${styles.modalWrap} ${styles.modalWrapOpen}`} aria-label={lang === 'FR' ? 'Mon espace' : 'Личный кабинет'} aria-modal>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.sidebar}>
            <div className={styles.sidebarTop}>
              <div className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
              <div className={`${styles.skeleton} ${styles.skeletonName}`} />
              <div className={`${styles.skeleton} ${styles.skeletonEmail}`} />
            </div>
          </div>
          <div className={styles.mainContent}>
            <div className={styles.contentScroll}>
              <div className={styles.section}>
                {[1, 2, 3].map(i => (
                  <div key={i} className={styles.skeletonBlock}>
                    <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
                    <div className={`${styles.skeleton} ${styles.skeletonField}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.modalWrap} ${open ? styles.modalWrapOpen : ''}`}
      onClick={tryClose}
      aria-hidden={!open}
    >
      {/* Unsaved toast */}
      {warnVisible && (
        <div className={styles.unsavedToast} onClick={e => e.stopPropagation()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          {t.profile.unsavedWarning}
        </div>
      )}

      {/* Modal */}
      <form
        className={styles.modal}
        ref={dialogRef}
        onSubmit={handleSubmit}
        noValidate
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={lang === 'FR' ? 'Mon espace' : 'Личный кабинет'}
        aria-modal
      >

        <ProfileSidebar
          headerName={headerName}
          email={email}
          photoURL={photoURL}
          regYear={regYear}
          missingCount={form.missingCount}
          navItems={navItems}
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          onLogout={handleLogout}
        />

        <div className={styles.mainContent}>
          <ProfileMobileHeader
            headerName={headerName}
            email={email}
            photoURL={photoURL}
            bookings={tickets.bookings}
          />

          {/* Close button */}
          <button
            type="button"
            className={styles.closeBtn}
            onClick={tryClose}
            aria-label={lang === 'FR' ? 'Fermer' : 'Закрыть'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <ProfileMobileTabBar
            activeTab={activeMobileTab}
            onSelect={setMobileTab}
            hasProfileWarning={form.missingBirthday || form.missingPhone}
          />

          {/* Scrollable content area */}
          <div className={styles.contentScroll} data-scroll-lock-allow="true">

            {activeSection === 'personal' && (
              <PersonalSection
                form={form}
                t={t}
                email={email}
                nameProviderLabel={
                  form.facebookLinked
                    ? (lang === 'FR' ? 'via Facebook' : 'через Facebook')
                    : isGoogleProvider ? googleLabel : undefined
                }
                emailProviderLabel={isGoogleProvider ? googleLabel : undefined}
                pulseBirthday={pulseBirthday}
                pulsePhone={pulsePhone}
                onSave={() => { void form.save({ withValidation: true }); }}
              />
            )}

            {activeSection === 'contacts' && (
              <ContactsSection form={form} t={t} pulsePhone={pulsePhone} />
            )}

            {activeSection === 'socials' && <SocialsSection form={form} t={t} />}

            {activeSection === 'notifications' && <NotificationsSection form={form} t={t} />}

            {activeSection === 'tickets' && (
              <TicketsSection
                bookings={tickets.bookings}
                activeBookings={tickets.activeBookings}
                loading={tickets.loading}
                error={tickets.error}
                t={t}
                expandedTicketId={expandedTicketId}
                onToggleTicket={id => setExpandedTicketId(prev => prev === id ? null : id)}
                dismissingIds={tickets.dismissingIds}
                onStartDismiss={tickets.startDismiss}
                onCancelDismiss={tickets.cancelDismiss}
              />
            )}

            {(activeSection === 'favorites' || activeSection === 'shows') && (
              <AttendedSection
                title={activeSection === 'favorites'
                  ? (lang === 'FR' ? 'Mes spectacles' : 'Мои спектакли')
                  : t.profile.historyAttended}
                bookings={tickets.bookings}
                attendedBookings={tickets.attendedBookings}
                loading={tickets.loading}
                t={t}
              />
            )}

            {activeSection === 'settings' && (
              <SettingsSection
                form={form}
                t={t}
                // Настройки не трогают обязательные поля профиля, поэтому
                // сохраняются без валидации — иначе пустой телефон блокировал бы
                // переключение уведомлений.
                onSave={() => { void form.save(); }}
                onLogout={handleLogout}
              />
            )}

          </div>

          {/* ── Save button — only for form sections ── */}
          {FORM_SECTIONS.includes(activeSection) && (
            <div className={styles.saveRow}>
              <button type="submit" className={styles.saveBtn} disabled={form.saving}>
                {form.saving ? '…' : t.profile.save}
              </button>
              {form.savedMsg && (
                <span className={styles.savedStatus}>
                  {lang === 'FR' ? 'Enregistré à l\'instant' : 'Сохранено только что'}
                </span>
              )}
            </div>
          )}

        </div>
      </form>
    </div>
  );
}
