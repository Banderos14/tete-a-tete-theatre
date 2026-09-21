// Админка театра. Этот файл — оболочка: гейт доступа, шапка и переключение
// вкладок. Данные живут в useAdminData, рассылка — в useNewsletter,
// содержимое вкладок — в *Tab-файлах.
//
// Гейт здесь только для UI: настоящая проверка роли делается на сервере
// (isAdminUid в server/shared/auth.ts) — клиентский флаг ничего не защищает.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { RU } from '../../i18n';
import { useAdminData } from './useAdminData';
import { useNewsletter } from './useNewsletter';
import { BookingsTab } from './BookingsTab';
import { UsersTab } from './UsersTab';
import { NewsletterTab } from './NewsletterTab';
import { AdminConfirmDialogs } from './AdminConfirmDialogs';
import type { AdminTab, ConfirmAction, FilterShowId, FilterStatus } from './adminTypes';
import styles from './AdminPage.module.scss';

/** Через сколько не-админа уводит на лендинг, мс. */
const REDIRECT_DELAY_MS = 1500;

export function AdminPage() {
  const navigate = useNavigate();
  const t        = RU;
  const { user, userProfile, loading } = useAuth();

  const isAdmin = userProfile?.role === 'admin';

  const data       = useAdminData(!loading && isAdmin);
  const newsletter = useNewsletter(user);

  const [tab,          setTab]          = useState<AdminTab>('bookings');
  const [filterShow,   setFilterShow]   = useState<FilterShowId>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  // Не-админу сначала показываем отказ, затем уводим на лендинг.
  useEffect(() => {
    if (loading || isAdmin) return;
    const timer = setTimeout(() => navigate('/'), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading, isAdmin, navigate]);

  if (loading) {
    return <div className={styles.centered}><span className={styles.spinner} /></div>;
  }

  if (!isAdmin) {
    return (
      <div className={styles.centered}>
        <p className={styles.accessDenied}>{t.admin.accessDenied}</p>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          {t.admin.backToSite}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>

      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>{t.admin.title}</h1>
        <div className={styles.topBarActions}>
          <button className={styles.checkinBtn} onClick={() => navigate('/admin/checkin')}>
            Проверка билетов
          </button>
          <button className={styles.backBtn} onClick={() => navigate('/')}>
            {t.admin.backToSite}
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === 'bookings' ? styles.tabActive : ''}`}
          onClick={() => setTab('bookings')}
        >{t.admin.bookingsTab}</button>
        <button
          className={`${styles.tabBtn} ${tab === 'users' ? styles.tabActive : ''}`}
          onClick={() => setTab('users')}
        >{t.admin.usersTab} ({data.users.length})</button>
        <button
          className={`${styles.tabBtn} ${tab === 'newsletter' ? styles.tabActive : ''}`}
          onClick={() => { setTab('newsletter'); newsletter.clearResult(); }}
        >Рассылка</button>
      </div>

      {tab === 'bookings' && (
        <BookingsTab
          bookings={data.bookings}
          fetching={data.fetching}
          updatingId={data.updatingId}
          actionError={data.actionError}
          actionNotice={data.actionNotice}
          onDismissActionError={data.dismissActionError}
          onReload={data.reload}
          onResendTicket={id => { void data.resendTicket(id); }}
          filterShow={filterShow}
          onFilterShow={setFilterShow}
          filterStatus={filterStatus}
          onFilterStatus={setFilterStatus}
          onConfirmAction={setConfirmAction}
        />
      )}

      {tab === 'users' && (
        <UsersTab
          users={data.users}
          fetching={data.fetching}
          updatingUserId={data.updatingUserId}
          currentUid={user?.uid}
          deleteUserError={data.deleteUserError}
          onDismissError={data.dismissDeleteUserError}
          onConfirmAction={setConfirmAction}
        />
      )}

      {tab === 'newsletter' && <NewsletterTab newsletter={newsletter} />}

      <AdminConfirmDialogs
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        updatingId={data.updatingId}
        updatingUserId={data.updatingUserId}
        onSetPaymentStatus={(id, status) => { void data.setPaymentStatus(id, status); }}
        onSetStatus={(id, status) => { void data.setStatus(id, status); }}
        onDeleteBooking={(id) => { void data.deleteBooking(id); }}
        onDeleteUser={(uid) => { void data.deleteUser(uid); }}
      />

    </div>
  );
}
